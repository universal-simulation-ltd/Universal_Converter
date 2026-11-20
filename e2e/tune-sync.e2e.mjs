// tune-sync.e2e.mjs — the phone app's tab order follows the account (James,
// 2026-10-30: "mobile app and web app settings in tune this app should be
// saved and synced to their account … Global rule"; @unisim/sdk 0.232.0
// createSyncedSettings, src/native/tabOrder.ts).
//
//   npm run test:tune-sync   (dev server up: npm run dev, or E2E_BASE_URL)
//
// Run on the phone screens in a browser (`?app`, dev only), where Tune this
// app ▸ Tab order lives. Supabase is mocked at the network: every /auth/v1,
// /rest/v1 and /functions/v1 request is answered here, and `user_app_prefs`
// is ONE table in this process, so two browser contexts signed in as the same
// person are two devices on one account. A signed-in context carries a
// made-up session in localStorage ('universal-suite-auth'), so the SDK's real
// sync runs, not its offline mock.
//
//   • signed out: a new order persists over a reload and nothing is sent;
//   • the order saved before (`converter:tab-order`) is kept, unstamped;
//   • signed in: a new order goes to `tune-app:converter` as { at, values };
//   • a second device opens with it, changes it, and the first follows;
//   • Reset to defaults on one device puts the other back too.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173/'

const PRODUCT = 'converter'
const ROW = `tune-app:${PRODUCT}`
const STORE_KEY = `unisim:settings:${PRODUCT}`
const DEFAULT = ['all', 'audio', 'image', 'video', 'document']

const PLAYWRIGHT_CANDIDATES = [
  '../node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../../backoffice/universal-platform/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
]

async function loadPlaywright() {
  // PLAYWRIGHT_MODULE: an absolute path to any checkout's playwright/index.mjs.
  const candidates = [process.env.PLAYWRIGHT_MODULE, ...PLAYWRIGHT_CANDIDATES.map((rel) => join(HERE, rel))].filter(Boolean)
  for (const file of candidates) {
    let mod
    try {
      const m = await import(pathToFileURL(file).href)
      mod = m.default ?? m
    } catch { continue }
    try {
      const probe = await mod.chromium.launch()
      await probe.close()
      return mod
    } catch { /* next */ }
  }
  console.error('No usable Playwright found.')
  process.exit(2)
}

const failures = []
function check(label, condition, detail) {
  if (condition) console.log(`  ✓ ${label}`)
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

// ── The mocked account ───────────────────────────────────────────────────────

/** user_app_prefs: { uid: { app: data } }, and every upsert. */
const table = {}
const upserts = []

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function sessionFor(uid) {
  const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 3600
  const user = {
    id: uid, aud: 'authenticated', role: 'authenticated', email: `${uid}@example.invalid`,
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
    created_at: '2026-01-01T00:00:00Z', is_anonymous: false,
  }
  const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp, role: 'authenticated', aal: 'aal1', email: user.email, session_id: `s-${uid}` })}.sig`
  return { access_token, refresh_token: `r-${uid}`, token_type: 'bearer', expires_in: 365 * 24 * 3600, expires_at: exp, user }
}
function uidOf(request) {
  const token = (request.headers().authorization ?? '').replace(/^Bearer\s+/i, '')
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub ?? null } catch { return null }
}

async function answer(route) {
  const req = route.request()
  const url = new URL(req.url())
  const path = url.pathname
  const uid = uidOf(req)
  if (path.startsWith('/auth/v1/user')) {
    return uid ? route.fulfill({ json: sessionFor(uid).user }) : route.fulfill({ status: 401, json: { message: 'no session' } })
  }
  if (path.startsWith('/auth/v1/')) return route.fulfill({ json: {} })
  if (path === '/rest/v1/user_app_prefs') {
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() ?? '[]')
      for (const row of [].concat(body)) {
        upserts.push(row)
        table[row.user_id] = { ...(table[row.user_id] ?? {}), [row.app]: row.data }
      }
      return route.fulfill({ status: 201, body: '' })
    }
    const mine = uid ? (table[uid] ?? {}) : {}
    const eq = url.searchParams.get('app')
    let rows = Object.entries(mine).map(([app, data]) => ({ app, data, user_id: uid }))
    if (eq?.startsWith('eq.')) rows = rows.filter((r) => r.app === eq.slice(3))
    else if (eq?.startsWith('in.(')) {
      const list = eq.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, ''))
      rows = rows.filter((r) => list.includes(r.app))
    }
    if ((req.headers().accept ?? '').includes('vnd.pgrst.object')) {
      return rows[0]
        ? route.fulfill({ json: rows[0] })
        : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } })
    }
    return route.fulfill({ json: rows })
  }
  if (path.startsWith('/rest/v1/rpc/')) return route.fulfill({ json: null })
  if (path.startsWith('/rest/v1/')) {
    if ((req.headers().accept ?? '').includes('vnd.pgrst.object')) return route.fulfill({ status: 406, json: { code: 'PGRST116' } })
    return route.fulfill({ json: [] })
  }
  return route.fulfill({ json: {} })
}

// ── Devices ──────────────────────────────────────────────────────────────────

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const errors = []

async function device({ uid = null, seed = {} } = {}) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true })
  await context.route(/\/(auth|rest|functions|storage)\/v1\//, answer)
  await context.route(/\/realtime\/v1\//, (r) => r.abort())
  const session = uid ? sessionFor(uid) : null
  await context.addInitScript(([session, seed]) => {
    if (sessionStorage.getItem('tune-sync:seeded')) return
    sessionStorage.setItem('tune-sync:seeded', '1')
    if (session) localStorage.setItem('universal-suite-auth', JSON.stringify(session))
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
  }, [session, seed])
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(String(e)))
  const d = {
    page,
    close: () => context.close(),
    open: async () => {
      await page.goto(new URL('?app', BASE).href, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
    },
    // Tune this app, as ⋯ ▸ Tune this app opens it.
    tune: async () => {
      await page.evaluate(async () => {
        const { usePhoneNav } = await import('/src/native/nav.ts')
        usePhoneNav.getState().push('tune')
      })
      await page.getByRole('button', { name: 'Move Audio earlier' }).first().waitFor({ timeout: 10000 })
    },
    earlier: async (name) => {
      await page.getByRole('button', { name: `Move ${name} earlier` }).first().click()
      await page.waitForTimeout(400)
    },
    reset: async () => {
      await page.getByRole('button', { name: /Reset to defaults/ }).first().click()
      await page.waitForTimeout(300)
      const confirm = page.getByRole('button', { name: /^Reset$/ })
      if (await confirm.count()) await confirm.first().click()
      await page.waitForTimeout(600)
    },
    order: async () => (await page.evaluate(async () => {
      const { useTabOrder } = await import('/src/native/tabOrder.ts')
      return useTabOrder.getState().order
    })),
    stored: () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), STORE_KEY),
  }
  return d
}
const rowUps = () => upserts.filter((u) => u.app === ROW)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

try {
  console.log('\nsigned out: this device only')
  {
    const a = await device()
    await a.open()
    await a.tune()
    check('the order starts as the default', same(await a.order(), DEFAULT))
    await a.earlier('Audio')
    const moved = ['audio', 'all', 'image', 'video', 'document']
    check('Move Audio earlier → saved on the device', same(await a.order(), moved) && same((await a.stored())?.tabOrder, moved), JSON.stringify(await a.stored()))
    await a.open()
    check('a reload keeps it', same(await a.order(), moved))
    check('nothing is sent to an account', rowUps().length === 0, JSON.stringify(upserts))
    await a.close()
  }

  console.log('\nthe order saved before is kept')
  {
    const old = ['video', 'all', 'audio', 'image', 'document']
    const a = await device({ uid: 'u-old', seed: { 'converter:tab-order': JSON.stringify(old) } })
    await a.open()
    check('the old order is the order', same(await a.order(), old), JSON.stringify(await a.order()))
    check('…moved onto the store', same((await a.stored())?.tabOrder, old))
    check('…and, never changed here, not sent', rowUps().length === 0, JSON.stringify(upserts))
    await a.close()
  }

  console.log('\nsigned in: two devices on one account')
  {
    const a = await device({ uid: 'u1' })
    const b = await device({ uid: 'u1' })
    await a.open()
    check('opening the app sends nothing', rowUps().length === 0)
    await a.tune()
    await a.earlier('Images')
    const one = ['all', 'image', 'audio', 'video', 'document']
    const ups = rowUps()
    check('A moves a tab → one write to tune-app:converter, for this account', ups.length === 1 && ups[0].user_id === 'u1', JSON.stringify(ups))
    check('…holding only the stamp and the order', ups[0] && same(Object.keys(ups[0].data).sort(), ['at', 'values'])
      && same(ups[0].data.values, { tabOrder: one }), JSON.stringify(ups[0]?.data))
    await b.open()
    check('B opens with that order', same(await b.order(), one), JSON.stringify(await b.order()))
    check('…and sends nothing back', rowUps().length === 1)
    await b.tune()
    await b.earlier('Files')
    const two = ['all', 'image', 'audio', 'document', 'video']
    check('B moves another → written', rowUps().length === 2 && same(rowUps()[1].data.values.tabOrder, two))
    await a.open()
    check('A, reopened, has B’s (newest wins)', same(await a.order(), two), JSON.stringify(await a.order()))
    await a.tune()
    await a.reset()
    check('A resets to defaults → the default order is written', same(rowUps().at(-1)?.data?.values?.tabOrder, DEFAULT), JSON.stringify(rowUps().at(-1)))
    await b.open()
    check('…and B is back to it too', same(await b.order(), DEFAULT))
    const before = rowUps().length
    await a.open()
    await b.open()
    check('reopening both sends nothing more', rowUps().length === before)
    await a.close()
    await b.close()
  }

  check('no page errors', errors.length === 0, errors[0])
} finally {
  await browser.close()
}

console.log(failures.length ? `\n${failures.length} failed` : '\nall passed')
process.exit(failures.length ? 1 : 0)
