// A dropped FOLDER, driven in a real browser (James, 2026-09-27): the files
// keep their place in the tree, the ones nothing converts are skipped and
// counted, and "every tab as one ZIP" hands back the same tree under the
// folder's own name.
//
// ⚠️ It goes in through "or choose a folder" — the dialog route — because a
// real directory DROP cannot be synthesised: `FileSystemEntry` has no
// constructor. The walk a drop takes is pinned against a fake entry tree in
// the SDK (`packages/sdk/tests/folder-drop.mjs`), and both routes arrive here
// as the same `webkitRelativePath`.
//
//   node e2e/folders.e2e.mjs
//
// Desktop-sized, because phones never show the folder button at all.

import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TMP = path.join(HERE, '.tmp-folders')

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


const TREE = path.join(TMP, 'Trip')
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(path.join(TREE, 'Day 1'), { recursive: true })
fs.writeFileSync(path.join(TREE, 'a.png'), makePng())
fs.writeFileSync(path.join(TREE, 'Day 1', 'b.png'), makePng())
fs.writeFileSync(path.join(TREE, 'Day 1', 'tone.wav'), makeWav())
// Skipped: nothing converts a zip. Hidden: never even counted.
fs.writeFileSync(path.join(TREE, 'junk.zip'), Buffer.from('PK\x05\x06' + '\0'.repeat(18), 'latin1'))
fs.writeFileSync(path.join(TREE, '.DS_Store'), 'x')

const port = await freePort()
const server = await startDevServer(port)
const browser = await chromium.launch()
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, acceptDownloads: true })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`http://localhost:${port}/converter/`, { waitUntil: 'networkidle' })

  console.log('\n── Choose a folder ──────────────────────────────────────────')
  const pick = page.getByRole('button', { name: 'or choose a folder' })
  check('the folder button is offered on a desktop browser', await pick.isVisible())
  const chooser = page.waitForEvent('filechooser')
  await pick.click()
  await (await chooser).setFiles(TREE)

  await page.getByText('files sorted').waitFor({ timeout: 10000 })
  const centre = await page.locator('text=files sorted').locator('..').innerText()
  check('three convertible files were sorted (the zip and .DS_Store were not)', /\b3\b/.test(centre), centre)
  const note = page.getByText(/Skipped 1 file in the folder/)
  check('the zip is counted as skipped, not named as rejected', await note.isVisible())
  check('nothing is listed as "Not converted"', (await page.getByText('Not converted:').count()) === 0)

  console.log('\n── Rows keep their folder ───────────────────────────────────')
  await page.getByRole('button', { name: /2 pictures/ }).click()
  check('a picture row shows its folder', await page.getByText('Trip/Day 1/', { exact: true }).first().isVisible())
  await page.getByRole('button', { name: /^Convert 2 files$/ }).click()
  await page.getByText('Ready to download').waitFor({ timeout: 30000 })

  await page.getByRole('tab', { name: /Audio/ }).or(page.getByRole('button', { name: /^Audio/ })).first().click()
  const firstSave = page.waitForEvent('download')
  await page.getByRole('button', { name: /^Convert and save 1 file$/ }).click()
  await firstSave

  console.log('\n── One ZIP from every tab, tree intact ──────────────────────')
  const all = page.getByRole('button', { name: 'Download all 3 from every tab as one ZIP' })
  check('the studio tab offers every tab as one ZIP', await all.isVisible())
  const dl = page.waitForEvent('download')
  await all.click()
  const download = await dl
  check('the ZIP is named after the folder', download.suggestedFilename() === 'Trip-converted.zip', download.suggestedFilename())
  const zipPath = path.join(TMP, 'out.zip')
  await download.saveAs(zipPath)
  const names = execFileSync('python3', ['-c', 'import sys,zipfile;print(chr(10).join(zipfile.ZipFile(sys.argv[1]).namelist()))', zipPath], { encoding: 'utf8' }).trim().split('\n')
  check('pictures come back at their place in the tree', names.includes('Trip/a.jpg') && names.includes('Trip/Day 1/b.jpg'), names.join(', '))
  check('the sound comes back beside the picture it sat with', names.some((n) => /^Trip\/Day 1\/tone\.\w+$/.test(n)), names.join(', '))
  check('three entries — nothing skipped sneaks in', names.length === 3, names.join(', '))

  await page.getByRole('tab', { name: /All/ }).or(page.getByRole('button', { name: /^All/ })).first().click()
  check('the All tab offers the same one ZIP', await page.getByRole('button', { name: 'Download all 3 converted files as one ZIP' }).isVisible())

  check('no uncaught errors in the page', errors.length === 0, errors.join(' | '))
} finally {
  await browser.close()
  server.kill()
  fs.rmSync(TMP, { recursive: true, force: true })
}

console.log(`\n${passed} passed, ${failures.length} failed`)
process.exit(failures.length ? 1 : 0)
