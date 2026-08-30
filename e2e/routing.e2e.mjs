// Which tab a drop leaves you on, driven in a real browser.
//
// The rules themselves are pure and pinned in `scripts/selftest.mjs`
// (`tabAfterDrop`). This suite covers the half that a pure test cannot: that
// the store is actually WIRED to them from every drop target — the landing
// page, the All tab's circle, and each studio's own "drop more" strip — and
// that the tab really changes in front of a person.
//
// It exists because this is behaviour that regresses in silence. Nothing throws
// when the app leaves you on the wrong tab; it just quietly stops being useful,
// and the only witness is somebody on a phone who has to press Images every
// time they pick one photo.
//
//   node e2e/routing.e2e.mjs
//
// Everything is run at 390 × 844 with touch, because a phone is where landing
// on the wrong tab costs the most.

import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TMP = path.join(HERE, '.tmp-routing')

// Found by LOOKING for a sibling's Playwright, and launching before committing
// to it — see the long note in `images.e2e.mjs` for why both halves matter.
function playwrightCandidates() {
  const apps = path.resolve(HERE, '../..')
  const out = []
  for (const dir of fs.readdirSync(apps)) {
    for (const entry of ['index.mjs', 'index.js']) {
      const p = path.join(apps, dir, 'node_modules', 'playwright', entry)
      if (fs.existsSync(p)) out.push(p)
    }
  }
  return out
}

async function loadChromium() {
  const problems = []
  for (const file of playwrightCandidates()) {
    let mod
    try {
      mod = await import(pathToFileURL(file).href).then((m) => m.default ?? m)
    } catch (err) {
      problems.push(`  ${file}\n    import: ${String(err).split('\n')[0]}`)
      continue
    }
    try {
      const probe = await mod.chromium.launch()
      await probe.close()
      return mod.chromium
    } catch (err) {
      problems.push(`  ${file}\n    launch: ${String(err).split('\n')[0]}`)
    }
  }
  console.error(
    'No usable Playwright found in a sibling Universal app.\n' +
      (problems.join('\n') || '  (none installed)') +
      '\n\nInstall one:  npm i -D playwright && npx playwright install chromium',
  )
  process.exit(2)
}

const chromium = await loadChromium()

// ── Harness ──────────────────────────────────────────────────────────────────

let passed = 0
const failures = []

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ok   ${name}`)
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function freePort() {
  const net = await import('node:net')
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

function startDevServer(port) {
  const vite = path.resolve(HERE, '../node_modules/vite/bin/vite.js')
  const child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], {
    cwd: path.resolve(HERE, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('dev server did not start in 90s')), 90000)
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes(String(port))) {
        clearTimeout(timer)
        setTimeout(() => resolve(child), 800)
      }
    })
    child.stderr.on('data', (chunk) => process.stderr.write(chunk))
    child.on('exit', (code) => reject(new Error(`dev server exited with ${code}`)))
  })
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
// One of each kind, written here rather than committed: the routing only reads
// the extension and the MIME type, so the smallest legal file of each will do.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([head, body, crc])
}

function makePng(size = 8) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc(size * (1 + size * 4))
  let at = 0
  for (let y = 0; y < size; y++) {
    raw[at++] = 0
    for (let x = 0; x < size; x++) {
      raw[at++] = (x * 32) & 0xff
      raw[at++] = (y * 32) & 0xff
      raw[at++] = 0x80
      raw[at++] = 0xff
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A quarter-second of silence — enough for the audio tab to accept the row. */
function makeWav(seconds = 0.25, rate = 8000) {
  const n = Math.round(seconds * rate)
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  return buf
}

fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
fs.writeFileSync(path.join(TMP, 'one.png'), makePng())
fs.writeFileSync(path.join(TMP, 'two.png'), makePng())
fs.writeFileSync(path.join(TMP, 'tone.wav'), makeWav())
fs.writeFileSync(path.join(TMP, 'notes.txt'), 'A document, for the Files tab.\n')
// Here to be turned away by the sorter. ⚠️ NOT an .mkv, which is the obvious
// choice and the wrong one: `kindOf` reads the browser's `video/x-matroska`
// and sends it to the Video tab, where it becomes an unsupported ROW rather
// than a rejection — so the drop would look mixed and this case would pass
// while testing nothing. A zip has no kind at all.
fs.writeFileSync(path.join(TMP, 'archive.zip'), Buffer.from('PK\x05\x06' + '\0'.repeat(18), 'latin1'))

// A real MP4, built by ffmpeg where there is one. It has to be real: a bogus
// file makes the <video> element log a load failure, and the "no uncaught
// errors" check at the bottom would then be reporting the fixture, not the app.
// Skipped rather than faked where ffmpeg is absent — a check that announces it
// did not run is honest; one that quietly passes is not.
const MP4 = path.join(TMP, 'soundtrack.mp4')
let haveMp4 = false
try {
  execFileSync('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=15:duration=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', MP4,
  ], { stdio: 'ignore' })
  haveMp4 = true
} catch {
  haveMp4 = false
}

const PNG = path.join(TMP, 'one.png')
const PNG2 = path.join(TMP, 'two.png')
const WAV = path.join(TMP, 'tone.wav')
const TXT = path.join(TMP, 'notes.txt')
const ZIP = path.join(TMP, 'archive.zip')

// ── Drive it ─────────────────────────────────────────────────────────────────

const PORT = await freePort()
const APP = `http://localhost:${PORT}/converter/`
const server = await startDevServer(PORT)
const browser = await chromium.launch()

const pageErrors = []

/**
 * A fresh phone-sized page. One per case, deliberately: the rules turn on
 * whether the queue was empty, so a case that inherited the last one's files
 * would be testing something else.
 */
async function phone() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text())
  })
  await page.goto(APP, { waitUntil: 'networkidle' })
  return { context, page }
}

/**
 * The selected tab's label.
 *
 * ⚠️ Read off `aria-selected`, never off the styling and never with a text
 * search. Every Universal App renders the whole suite changelog into its DOM,
 * so an unscoped `getByText('Images')` can match a release note.
 */
const currentTab = (page) => page.locator('[role=tab][aria-selected=true]').innerText()

/** Add files through whichever drop zone is mounted, and let the queue settle. */
async function add(page, files) {
  await page.locator('input[type=file]').last().setInputFiles(files)
  await page.waitForTimeout(1800)
}

console.log('\n── A single-kind drop goes straight to that studio ───────────')
{
  for (const [file, tab] of [[PNG, 'Images'], [WAV, 'Audio'], [TXT, 'Files']]) {
    const { context, page } = await phone()
    check(`the app opens on All (before ${tab})`, (await currentTab(page)).startsWith('All'))
    await add(page, file)
    check(`one file of one kind lands on ${tab}`,
      (await currentTab(page)).startsWith(tab), await currentTab(page))
    await context.close()
  }
}

console.log('\n── …however many files, as long as they are all one kind ────')
{
  const { context, page } = await phone()
  await add(page, [PNG, PNG2])
  check('two pictures land on Images together',
    (await currentTab(page)).startsWith('Images'), await currentTab(page))
  await context.close()
}

console.log('\n── A MIXED drop has nowhere single to go, so it stays ────────')
{
  const { context, page } = await phone()
  await add(page, [PNG, WAV])
  check('a mixed drop stays on All', (await currentTab(page)).startsWith('All'), await currentTab(page))
  check('and the sorting column says where everything went',
    await page.getByText('Where everything went').isVisible())
  await context.close()
}

console.log('\n── A rejection keeps you where the notice is ────────────────')
{
  // The "Not converted: …" line is rendered by the All tab alone. Navigating
  // away from a drop that has something to explain would throw the explanation
  // away — so a drop the sorter turned anything away from does not navigate.
  const { context, page } = await phone()
  await add(page, [PNG, ZIP])
  check('a drop with a refused file stays on All',
    (await currentTab(page)).startsWith('All'), await currentTab(page))
  check('and names the file it could not take',
    await page.getByText('archive.zip', { exact: false }).first().isVisible())
  await context.close()
}

console.log('\n── More of the SAME kind must not move anybody ──────────────')
{
  const { context, page } = await phone()
  await add(page, PNG)
  check('the first picture routed to Images', (await currentTab(page)).startsWith('Images'))
  await add(page, PNG2)
  check('a second picture leaves you on Images',
    (await currentTab(page)).startsWith('Images'), await currentTab(page))
  // The one that matters most: it must still be true a third time, and after a
  // tab the person chose by hand.
  await page.getByRole('tab', { name: /^Images/ }).click()
  await add(page, PNG)
  check('and a third, on a tab picked by hand',
    (await currentTab(page)).startsWith('Images'), await currentTab(page))
  await context.close()
}

console.log('\n── A DIFFERENT kind bounces back to the multi-file view ─────')
{
  const { context, page } = await phone()
  await add(page, PNG)
  check('starting on Images', (await currentTab(page)).startsWith('Images'))
  await add(page, WAV)
  check('adding a sound file from Images bounces to All',
    (await currentTab(page)).startsWith('All'), await currentTab(page))
  check('the multi-file view accounts for both',
    await page.getByText('onto 2 tabs').isVisible())
  check('the pictures are still on the Images tab',
    await page.getByRole('button', { name: /1 picture/ }).isVisible())
  check('and the sound file found the Audio tab',
    await page.getByRole('button', { name: /1 sound file/ }).isVisible())
  await context.close()
}

console.log('\n── An MP4 on the Audio tab is still a soundtrack request ────')
{
  // `acceptsOn` lets a video onto the Audio tab on purpose — that is how you ask
  // for its sound. The router must not "helpfully" sort it to Video and bounce
  // you, which is exactly the kind of thing a kind-based rule gets wrong.
  if (!haveMp4) {
    console.log('  !  ffmpeg not found — the MP4-on-Audio case did NOT run')
  } else {
    const { context, page } = await phone()
    await page.getByRole('tab', { name: /^Audio/ }).click()
    await add(page, MP4)
    check('an MP4 dropped on Audio stays on Audio',
      (await currentTab(page)).startsWith('Audio'), await currentTab(page))
    check('and it is queued there, not refused',
      await page.getByText('Queued', { exact: true }).first().isVisible())
    await context.close()
  }
}

check('no uncaught errors in the page', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

await browser.close()
server.kill()
fs.rmSync(TMP, { recursive: true, force: true })

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
