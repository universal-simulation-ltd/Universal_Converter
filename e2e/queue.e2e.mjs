// A long queue, driven in a real browser (James, 2026-09-29): past ten files
// the list shows its first eight and a "View all", and while a run is going a
// "Currently converting:" line above the list names the file it is on — the
// converting row is usually out of sight.
//
//   node e2e/queue.e2e.mjs
//
// Goes in through "or choose a folder", like folders.e2e.mjs: fifteen sounds
// in one folder is the shape that asked for this.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TMP = path.join(os.tmpdir(), 'converter-queue-e2e')
const SHOTS = process.env.SHOTS ?? ''

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


let failures = 0
function check(label, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
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

/** Silence, long enough that a run is still going when the page is looked at. */
function makeWav(seconds = 2, rate = 22050) {
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

const FILES = 15
const ALBUM = path.join(TMP, 'Album')
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(ALBUM, { recursive: true })
for (let n = 1; n <= FILES; n += 1) fs.writeFileSync(path.join(ALBUM, `${String(n).padStart(2, '0')} - Track.wav`), makeWav())

const port = await freePort()
const server = await startDevServer(port)
const browser = await chromium.launch()
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`http://localhost:${port}/converter/`, { waitUntil: 'networkidle' })

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'or choose a folder' }).click()
  await (await chooser).setFiles(ALBUM)
  // One kind only, so the drop lands straight on the Audio tab.

  console.log('\n── Collapsed ────────────────────────────────────────────────')
  const rows = page.locator('li', { hasText: 'Track.wav' })
  await rows.first().waitFor({ timeout: 10000 })
  check('eight rows shown of fifteen', (await rows.count()) === 8, String(await rows.count()))
  const firstNames = (await rows.allInnerTexts()).map((t) => t.match(/(\d\d) - Track\.wav/)?.[1]).join(' ')
  check('the picked folder lists in name order, not disk order', firstNames === '01 02 03 04 05 06 07 08', firstNames)
  const more = page.getByRole('button', { name: `View all ${FILES} files (${FILES - 8} more)` })
  check('"View all" names the total and what it hides', await more.isVisible())
  check('no "Currently converting" before a run', (await page.getByText('Currently converting:').count()) === 0)

  console.log('\n── Expanded ─────────────────────────────────────────────────')
  await more.click()
  check('every row shown', (await rows.count()) === FILES, String(await rows.count()))
  await page.getByRole('button', { name: 'Show fewer' }).click()
  check('"Show fewer" folds it back to eight', (await rows.count()) === 8, String(await rows.count()))

  console.log('\n── During a run ─────────────────────────────────────────────')
  await page.getByRole('button', { name: new RegExp(`^Convert ${FILES} files$`) }).click()
  const now = page.getByText('Currently converting:')
  await now.waitFor({ timeout: 30000 })
  const line = await now.locator('..').innerText()
  check('names a file from the queue', /\d\d - Track\.wav/.test(line), line)
  if (SHOTS) await page.evaluate(() => window.scrollTo(0, 0))
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'queue-running.png') })
  await page.getByText('Ready to download').waitFor({ timeout: 120000 })
  check('gone once the run finishes', (await now.count()) === 0)

  check('no uncaught errors in the page', errors.length === 0, errors.join(' | '))
} finally {
  await browser.close()
  server.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
