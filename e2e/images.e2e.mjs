// The Images tab, driven in a real browser.
//
// This one exists for the output FILENAME, which is the thing a library test
// keeps missing: `withExtension` can be perfectly correct and the file still
// land in your downloads as `photo.png.png`, because between the pure function
// and the disk there is an `<a download>` and a browser that is allowed to
// disagree with it. So every assertion here reads
// `download.suggestedFilename()` — the name the browser actually used — rather
// than the name the store computed.
//
// It also pins the two promises the panel now makes: PNG is the default target,
// and converting a queue of ONE saves it without a second click (while a queue
// of two does not, or a batch would fire a download per file).
//
//   node e2e/images.e2e.mjs

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TMP = path.join(HERE, '.tmp-images')
const PLAYWRIGHT = pathToFileURL(
  path.resolve(HERE, '../../Universal_Beam/node_modules/playwright/index.mjs'),
).href

const { chromium } = await import(PLAYWRIGHT).then((m) => m.default ?? m)

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
  // Vite's own binary, not `npm run dev` — see the note in files.e2e.mjs.
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
// Written here rather than committed as binaries: an 8×8 PNG is a dozen lines
// of zlib, and a fixture you can read is one you can trust.

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

/** A tiny opaque RGBA PNG — real bytes, so the browser's decoder is real too. */
function makePng(size = 8) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  const raw = Buffer.alloc(size * (1 + size * 4))
  let at = 0
  for (let y = 0; y < size; y++) {
    raw[at++] = 0 // filter: none
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

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#FE8C01"/></svg>`

fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
const png = makePng()
// The names are the test: a plain one, and one whose stem already has dots in
// it — the case a naive `name + '.' + ext` gets wrong.
for (const name of ['sample.png', 'my.photo.v2.png', 'second.png', 'SHOUTY.PNG']) {
  fs.writeFileSync(path.join(TMP, name), png)
}
fs.writeFileSync(path.join(TMP, 'logo.svg'), SVG)

// ── Drive it ─────────────────────────────────────────────────────────────────

const PORT = await freePort()
const APP = `http://localhost:${PORT}/converter/`
const server = await startDevServer(PORT)
const browser = await chromium.launch()
const context = await browser.newContext({ acceptDownloads: true })
const page = await context.newPage()

const pageErrors = []
page.on('pageerror', (err) => pageErrors.push(String(err)))
page.on('console', (msg) => {
  if (msg.type() === 'error') pageErrors.push(msg.text())
})

const downloads = []
page.on('download', (d) => downloads.push(d))

await page.goto(APP, { waitUntil: 'networkidle' })
await page.getByRole('tab', { name: /^Images/ }).click()

const fileInput = () => page.locator('input[type=file]').last()
// Anchored at the start, not exact: a format this browser cannot write carries
// a "•" in its label, and AVIF is routinely that format in headless Chromium.
const chip = (label) => page.getByRole('button', { name: new RegExp(`^${label}`) })

/** Queue one file, convert, and hand back the download the page produced. */
async function convertOne(filename) {
  await fileInput().setInputFiles(path.join(TMP, filename))
  const before = downloads.length
  await page.getByRole('button', { name: /Convert and save 1 file/ }).click()
  await page.getByText('Done', { exact: true }).first().waitFor({ timeout: 30000 })
  // The download fires in the same tick the row goes Done, but the event
  // crosses a process boundary — give it a moment rather than assuming.
  await page.waitForTimeout(1500)
  const got = downloads.slice(before)
  // Leave the queue empty for the next case.
  await page.getByRole('button', { name: /Remove / }).first().click()
  return got
}

console.log('\n── Defaults ─────────────────────────────────────────────────')
{
  check('PNG is the default target', await chip('PNG').getAttribute('aria-pressed') === 'true')
  for (const other of ['WebP', 'JPEG', 'AVIF']) {
    check(`${other} is not selected by default`,
      await chip(other).getAttribute('aria-pressed') === 'false')
  }
}

console.log('\n── The empty state is the ring, and it is clickable ─────────')
{
  // Same DropRing the All tab opens with. The queue tests below all reach the
  // hidden input directly, which would pass just as happily with a decorative
  // circle nobody can click — so the click is proved once, here.
  check('the Images tab greets you with the ring',
    await page.getByText('Drop images here').isVisible())
  const chooser = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    page.getByText('Drop images here').click(),
  ]).then(([c]) => c).catch(() => null)
  check('clicking the ring opens the file browser', chooser !== null)
  check('the format list sits under the ring, spelled out',
    await page.getByText('PNG, JPEG, WebP, GIF, BMP, AVIF and SVG').isVisible())
}

console.log('\n── One file converts and saves itself ───────────────────────')
{
  const got = await convertOne('sample.png')
  check('converting one file starts the download on its own', got.length === 1,
    `${got.length} downloads`)
  if (got.length === 1) {
    check('PNG → PNG is named .png, not .png.png',
      got[0].suggestedFilename() === 'sample.png', got[0].suggestedFilename())
    const saved = path.join(TMP, '.out.png')
    await got[0].saveAs(saved)
    const bytes = fs.readFileSync(saved)
    check('the saved file really is a PNG',
      bytes.subarray(1, 4).toString('latin1') === 'PNG', bytes.subarray(0, 8).toString('hex'))
  }
}

console.log('\n── Names with dots in the stem ──────────────────────────────')
{
  const got = await convertOne('my.photo.v2.png')
  check('only the last extension is replaced',
    got.length === 1 && got[0].suggestedFilename() === 'my.photo.v2.png',
    got.map((d) => d.suggestedFilename()).join(', '))
}

console.log('\n── An extension that arrives SHOUTING ───────────────────────')
{
  // Windows hands `.PNG` back exactly as it is stored, and an extension that
  // does not match the target's casing is the obvious way to end up appending
  // instead of replacing.
  const got = await convertOne('SHOUTY.PNG')
  check('an upper-case source extension is replaced, not appended',
    got.length === 1 && got[0].suggestedFilename() === 'SHOUTY.png',
    got.map((d) => d.suggestedFilename()).join(', '))
}

console.log('\n── A different target, and a different source ───────────────')
{
  await chip('JPEG').click()
  const jpeg = await convertOne('sample.png')
  check('PNG → JPEG is named .jpg',
    jpeg.length === 1 && jpeg[0].suggestedFilename() === 'sample.jpg',
    jpeg.map((d) => d.suggestedFilename()).join(', '))

  await chip('PNG').click()
  const svg = await convertOne('logo.svg')
  check('SVG → PNG is named .png',
    svg.length === 1 && svg[0].suggestedFilename() === 'logo.png',
    svg.map((d) => d.suggestedFilename()).join(', '))
}

console.log('\n── Two files do NOT save themselves ─────────────────────────')
{
  await fileInput().setInputFiles([path.join(TMP, 'sample.png'), path.join(TMP, 'second.png')])
  const before = downloads.length
  await page.getByRole('button', { name: /Convert 2 files/ }).click()
  await page.getByText('2 of 2 converted').waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
  check('a batch waits to be asked', downloads.length === before,
    `${downloads.length - before} downloads`)

  const saved = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).first().click(),
  ]).then(([d]) => d)
  check('the row’s Save button still names the file properly',
    saved.suggestedFilename() === 'sample.png', saved.suggestedFilename())

  // And the names INSIDE the zip, which nothing else looks at: a doubled
  // extension there is invisible until somebody unpacks the folder.
  const zip = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download all as ZIP/ }).click(),
  ]).then(([d]) => d)
  check('the zip is named for the tab', zip.suggestedFilename() === 'converted-images.zip',
    zip.suggestedFilename())
  const zipPath = path.join(TMP, '.out.zip')
  await zip.saveAs(zipPath)
  // Central-directory filenames, read straight out of the bytes.
  const bytes = fs.readFileSync(zipPath)
  const names = []
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes.readUInt32LE(i) !== 0x02014b50) continue
    const len = bytes.readUInt16LE(i + 28)
    names.push(bytes.subarray(i + 46, i + 46 + len).toString('utf8'))
  }
  check('the files inside the zip are named .png once',
    names.length === 2 && names.every((n) => /^[^.]+\.png$/.test(n)), names.join(', '))
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
