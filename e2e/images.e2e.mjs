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
// It also pins the promises the panel makes: JPEG is the default target,
// converting a queue of ONE saves it without a second click (while a queue of
// two does not, or a batch would fire a download per file) — and, since
// 2026-08-31, that ONE convert produces exactly ONE download rather than two,
// and that a see-through file is warned about before JPEG fills it with white.
//
//   node e2e/images.e2e.mjs

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TMP = path.join(HERE, '.tmp-images')
// ⚠️ Found by LOOKING, not by hard-coding a sibling's name. This used to be
// `../../Universal_Beam/node_modules/playwright/index.mjs`, which simply cannot
// run on a machine where that checkout is absent — as the Mac's was on
// 2026-08-20, taking both Converter e2e suites down with ERR_MODULE_NOT_FOUND
// at import time. Universal Date Polling's suite had already worked this out and
// carried a comment naming this file as the one that hadn't.
//
// It also LAUNCHES a browser before committing to a candidate: Playwright pins
// an exact browser revision, so a sibling whose package imports perfectly can
// still be paired with a build that was never downloaded here. Universal PDF's
// suite hit exactly that, passing the import and dying on `.launch()`.
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

/**
 * A tiny RGBA PNG — real bytes, so the browser's decoder is real too.
 *
 * `alpha` is the constant alpha byte: 0xff for the opaque fixtures everything
 * else uses, and anything less for the see-through one that drives the JPEG
 * flattening warning. It has to be a REAL alpha channel rather than a claim,
 * because what reads it is `sampleImage`'s `getImageData` on the far side of
 * the browser's own PNG decoder.
 */
function makePng(size = 8, alpha = 0xff) {
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
      raw[at++] = alpha
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
// Half-transparent throughout, so every sampled pixel trips the scan — the
// warning's job is to fire on a logo with a see-through ground, and a fixture
// that is only transparent in one corner would be testing the mosaic's
// coverage rather than the warning.
fs.writeFileSync(path.join(TMP, 'seethrough.png'), makePng(8, 0x80))
fs.writeFileSync(path.join(TMP, 'logo.svg'), SVG)
// The one fixture that cannot be written here. A HEIC is an HEVC still in an
// ISO container — there is no dozen-line encoder for it the way there is for a
// PNG — so 598 real bytes sit committed beside this file instead.
fs.copyFileSync(path.join(HERE, 'fixtures', 'sample.heic'), path.join(TMP, 'sample.heic'))

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
  // ⚠️ JPEG since 2026-08-31, and this assertion is the point of the change
  // rather than a detail of it. PNG was the default, so the ordinary path —
  // drop photos, press Convert — produced a BIGGER file every time (+338%
  // measured on a noise JPEG). The reasoning is on `DEFAULT_IMAGE_SETTINGS`.
  check('JPEG is the default target', await chip('JPEG').getAttribute('aria-pressed') === 'true')
  for (const other of ['WebP', 'PNG', 'AVIF']) {
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
    await page.getByText('PNG, JPEG, HEIC, WebP, GIF, BMP, AVIF and SVG').isVisible())
}

console.log('\n── One file converts and saves itself ───────────────────────')
{
  const got = await convertOne('sample.png')
  check('converting one file starts the download on its own', got.length === 1,
    `${got.length} downloads`)
  if (got.length === 1) {
    check('PNG → JPEG is named .jpg',
      got[0].suggestedFilename() === 'sample.jpg', got[0].suggestedFilename())
    const saved = path.join(TMP, '.out.jpg')
    await got[0].saveAs(saved)
    const bytes = fs.readFileSync(saved)
    check('the saved file really is a JPEG',
      bytes.subarray(0, 2).toString('hex') === 'ffd8', bytes.subarray(0, 8).toString('hex'))
  }
}

console.log('\n── The file saved itself, so the button says so ─────────────')
{
  // ⚠️ THE REGRESSION THIS FILE EXISTS FOR, as of 2026-08-31. Converting one
  // file auto-saved it and then left a button reading "Download the converted
  // file" underneath — so the obvious next press put a SECOND identical copy in
  // the downloads folder, same name, same bytes. Two downloads for one convert.
  // The assertions below are in the order somebody would hit them.
  await fileInput().setInputFiles(path.join(TMP, 'sample.png'))
  const before = downloads.length
  await page.getByRole('button', { name: /Convert and save 1 file/ }).click()
  await page.getByText('Done', { exact: true }).first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)

  check('the convert itself produced exactly one download',
    downloads.length - before === 1, `${downloads.length - before} downloads`)
  check('the card says the file is already saved',
    await page.getByText('Saved to your downloads.').isVisible())
  check('the button offers ANOTHER copy, not the first one',
    await page.getByRole('button', { name: 'Save another copy' }).isVisible())
  check('nothing still offers to download the file you have',
    await page.getByRole('button', { name: /^Download the converted file/ }).count() === 0)

  // And the button still works — re-saving is a real thing to want after a
  // browser's keep/discard prompt. It is the LABEL that was lying, not the
  // control, so the fix must not have quietly disabled it.
  const beforeSecond = downloads.length
  await page.getByRole('button', { name: 'Save another copy' }).click()
  await page.waitForTimeout(1500)
  check('pressing it deliberately does still save a second copy',
    downloads.length - beforeSecond === 1, `${downloads.length - beforeSecond} downloads`)

  await page.getByRole('button', { name: /Remove / }).first().click()
}

console.log('\n── PNG → PNG still is not .png.png ──────────────────────────')
{
  // Kept alive explicitly now that PNG is no longer the default: replacing an
  // extension with THE SAME extension is the case a naive implementation turns
  // into `sample.png.png`, and it stopped being exercised for free the moment
  // the default moved to JPEG.
  await chip('PNG').click()
  const got = await convertOne('sample.png')
  check('PNG → PNG is named .png, not .png.png',
    got.length === 1 && got[0].suggestedFilename() === 'sample.png',
    got.map((d) => d.suggestedFilename()).join(', '))
  if (got.length === 1) {
    const saved = path.join(TMP, '.out.png')
    await got[0].saveAs(saved)
    const bytes = fs.readFileSync(saved)
    check('the saved file really is a PNG',
      bytes.subarray(1, 4).toString('latin1') === 'PNG', bytes.subarray(0, 8).toString('hex'))
  }
  await chip('JPEG').click()
}

console.log('\n── Names with dots in the stem ──────────────────────────────')
{
  const got = await convertOne('my.photo.v2.png')
  check('only the last extension is replaced',
    got.length === 1 && got[0].suggestedFilename() === 'my.photo.v2.jpg',
    got.map((d) => d.suggestedFilename()).join(', '))
}

console.log('\n── An extension that arrives SHOUTING ───────────────────────')
{
  // Windows hands `.PNG` back exactly as it is stored, and an extension that
  // does not match the target's casing is the obvious way to end up appending
  // instead of replacing.
  const got = await convertOne('SHOUTY.PNG')
  check('an upper-case source extension is replaced, not appended',
    got.length === 1 && got[0].suggestedFilename() === 'SHOUTY.jpg',
    got.map((d) => d.suggestedFilename()).join(', '))
}

console.log('\n── A see-through file says so before it is flattened ────────')
{
  // The cost of the JPEG default: JPEG has no alpha, so `image.ts` fills white
  // behind the image. That is invisible until somebody puts the result on a
  // coloured background, which is the worst shape a loss can have — found late,
  // by someone else. The warning is what makes it loud.
  await fileInput().setInputFiles(path.join(TMP, 'seethrough.png'))
  const warning = page.getByText(/see-through, and JPEG has no transparency/)
  await warning.waitFor({ timeout: 15000 }).catch(() => {})
  check('a transparent file warns that JPEG will fill it with white',
    await warning.isVisible())

  // ⚠️ And it goes away on the formats that CAN carry alpha — WebP, PNG and
  // AVIF all have a channel, and our GIF writer keeps 1-bit transparency. A
  // warning that stayed up regardless would be teaching people to ignore it.
  await chip('PNG').click()
  check('choosing PNG takes the warning away', await warning.count() === 0)
  await chip('WebP').click()
  check('choosing WebP takes the warning away too', await warning.count() === 0)
  await chip('JPEG').click()
  check('and it comes back on JPEG', await warning.isVisible())
  await page.getByRole('button', { name: /Remove / }).first().click()
}

console.log('\n── An opaque file does NOT cry wolf ─────────────────────────')
{
  // The other half, and the one that decides whether the warning is worth
  // having: the ordinary opaque PNG screenshot must NOT get an amber line, or
  // the warning becomes furniture and stops being read.
  await fileInput().setInputFiles(path.join(TMP, 'sample.png'))
  await page.getByText(/8 × 8/).first().waitFor({ timeout: 15000 })
  check('an opaque PNG gets no transparency warning',
    await page.getByText(/see-through, and JPEG has no transparency/).count() === 0)
  await page.getByRole('button', { name: /Remove / }).first().click()
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

console.log('\n── A HEIC decodes ───────────────────────────')
{
  // The only input in the app that Chromium cannot decode AT ALL —
  // `createImageBitmap` and <img> both refuse a HEIC — so this is the one case
  // that proves the bundled decoder rather than the browser's. Without it, a
  // regression in the dynamic import shows up as a photo quietly queued as
  // "unsupported", which no other assertion here would notice.
  //
  // ⚠️ **This block was called "An iPhone photo" and it is NOT one.** The
  // fixture is written by libheif from a generated gradient: one 8-bit `hvc1`
  // item, no grid, no auxiliary images. A real iPhone photo is a `grid` of HEVC
  // tiles with a thumbnail and (on HDR shots) 10-bit samples beside it. The
  // first decoder shipped here, `heic2any`, passed this check and failed EVERY
  // photo off an actual phone. **This proves the wiring, not the format.** The
  // format is only ever proved by a file a phone wrote.
  // A HEIC row used to show a blank where every other row shows its size:
  // `probeDimensions` asked an <img> for it, and an <img> cannot load a HEIC.
  // The sampler decodes properly, so the dimensions come free with the estimate.
  await fileInput().setInputFiles(path.join(TMP, 'sample.heic'))
  check('a HEIC row shows its dimensions',
    await page.getByText('32 × 32').first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false))
  await page.getByRole('button', { name: /Remove / }).first().click()

  const got = await convertOne('sample.heic')
  check('HEIC → PNG is named .png',
    got.length === 1 && got[0].suggestedFilename() === 'sample.png',
    got.map((d) => d.suggestedFilename()).join(', '))
  if (got.length === 1) {
    const saved = path.join(TMP, '.out-heic.png')
    await got[0].saveAs(saved)
    const bytes = fs.readFileSync(saved)
    check('the saved file really is a PNG',
      bytes.subarray(1, 4).toString('latin1') === 'PNG', bytes.subarray(0, 8).toString('hex'))
    // ⚠️ The dimensions, not just the magic bytes. A decoder that hands back an
    // empty bitmap still encodes to a perfectly valid PNG — of nothing — and
    // the IHDR is the cheapest place to catch that. The fixture is 32×32.
    check('the picture inside it is the 32×32 the fixture holds',
      bytes.readUInt32BE(16) === 32 && bytes.readUInt32BE(20) === 32,
      `${bytes.readUInt32BE(16)}×${bytes.readUInt32BE(20)}`)
  }
}

console.log('\n── An estimate first, and another go at it ─────────')
{
  // Two promises the panel makes before anything is converted, and one it
  // makes after. The estimate is `lib/estimate.ts`; the re-arm is what stops a
  // finished queue sitting behind a dead "Convert 0 files" button.
  await chip('PNG').click()
  await fileInput().setInputFiles(path.join(TMP, 'sample.png'))
  const estimated = await page.getByText(/≈ /).first()
    .waitFor({ timeout: 15000 }).then(() => true).catch(() => false)
  check('a size estimate appears before anything is converted', estimated)

  await page.getByRole('button', { name: /Convert and save 1 file/ }).click()
  await page.getByText('Done', { exact: true }).first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1200)
  // ⚠️ The guess must GO, not sit beside the real number. Two sizes on one row
  // is an invitation to compare the estimator against itself.
  check('the estimate gives way to the real size once there is one',
    !(await page.getByText(/≈ /).first().isVisible().catch(() => false)))

  // The ask itself: clicking another format offers the conversion again.
  await chip('JPEG').click()
  const rearmed = await page.getByRole('button', { name: /Convert and save 1 file/ })
    .waitFor({ timeout: 8000 }).then(() => true).catch(() => false)
  check('picking another format puts the finished row back in the queue', rearmed)
  check('and the row is priced for the NEW format before it runs',
    await page.getByText(/≈ /).first().isVisible().catch(() => false))
  // The old PNG must not still be downloadable: it is not what the panel says.
  check('the stale result is dropped with the status',
    !(await page.getByRole('button', { name: 'Save', exact: true }).first().isVisible().catch(() => false)))

  const before = downloads.length
  await page.getByRole('button', { name: /Convert and save 1 file/ }).click()
  await page.getByText('Done', { exact: true }).first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
  const again = downloads.slice(before)
  check('the second pass really produces the second format',
    again.length === 1 && again[0].suggestedFilename() === 'sample.jpg',
    again.map((d) => d.suggestedFilename()).join(', '))

  await page.getByRole('button', { name: /Remove / }).first().click()
  await chip('PNG').click()
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
    page.getByRole('button', { name: /Download all \d+ files as a ZIP/ }).click(),
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
