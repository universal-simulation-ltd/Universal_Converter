// The Video tab's GIF target, driven in a real browser.
//
// gif.ts is proved byte for byte by scripts/selftest.mjs — but everything
// BETWEEN a dropped MP4 and that encoder only exists in a browser: WebCodecs,
// the canvas the frames are drawn on, the two decode passes, and the `<a
// download>` that names the file. None of it can be unit-tested, and all of it
// is where a GIF export actually goes wrong.
//
// So this queues a real H.264 file with a real audio track, presses the button,
// catches the download, and hands the bytes to ffprobe. The assertions are the
// promises the panel makes: 480 px on the longest edge, 15 frames a second, the
// clip's own length, and a silent file that did not fail for want of a
// soundtrack.
//
//   node e2e/video.e2e.mjs

import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TMP = path.join(HERE, '.tmp-video')

// Found by looking, not hard-coded — see the long note in images.e2e.mjs.
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

// ── Fixture ──────────────────────────────────────────────────────────────────
// Made here rather than committed: a two-second H.264 clip is a megabyte of
// binary nobody can review, and ffmpeg builds one in a moment. It carries an
// AUDIO track on purpose — a GIF has nowhere to put it, and "silently ignored"
// and "quietly fails" look identical until something asserts which happened.

function ffmpegVersion() {
  try {
    return execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0]
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

if (!ffmpegVersion()) {
  console.error('ffmpeg not found — it builds the fixture and reads the result back.\n  brew install ffmpeg')
  process.exit(2)
}

fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
const SOURCE = path.join(TMP, 'clip.mp4')
execFileSync('ffmpeg', [
  '-v', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=2',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '30',
  '-c:a', 'aac', '-shortest', SOURCE,
])

/** What ffprobe says about a GIF: size, frames, running time. */
function probeGif(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_read_frames',
    '-show_entries', 'format=duration', '-of', 'default=nw=1', file,
  ], { encoding: 'utf8' })
  const field = (name) => Number(out.match(new RegExp(`${name}=([\\d.]+)`))?.[1] ?? NaN)
  return { width: field('width'), height: field('height'), frames: field('nb_read_frames'), duration: field('duration') }
}

// ── Drive it ─────────────────────────────────────────────────────────────────

const chromium = await loadChromium()
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
await page.getByRole('tab', { name: /^Video/ }).click()

const fileInput = () => page.locator('input[type=file]').last()
const chip = (label) => page.getByRole('button', { name: new RegExp(`^${label}`) })

/**
 * Open the Advanced disclosure if it is shut.
 *
 * ⚠️ Not a plain click. Switching target swaps the whole disclosure for the
 * other one's, and `defaultOpen` makes it start OPEN whenever anything in it is
 * off its default — so once a trim is set, clicking "Advanced" shuts it.
 */
async function openAdvanced() {
  const button = page.getByRole('button', { name: /^Advanced/ })
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
}

/** Queue the clip, convert, and hand back the file the browser actually saved. */
async function convertToFile(name) {
  await fileInput().setInputFiles(SOURCE)
  const before = downloads.length
  await page.getByRole('button', { name: /Convert and save 1 file/ }).click()
  // Two decode passes over sixty frames — slower than an image, so give it room.
  await page.getByText('Done', { exact: true }).first().waitFor({ timeout: 120000 })
  await page.waitForTimeout(1500)
  const got = downloads.slice(before)
  await page.getByRole('button', { name: /Remove / }).first().click()
  if (got.length !== 1) return { downloads: got, file: null }
  const saved = path.join(TMP, name)
  await got[0].saveAs(saved)
  return { downloads: got, file: saved }
}

console.log('\n── The chips ────────────────────────────────────────────────')
{
  check('MP4 is still the default target', await chip('MP4').getAttribute('aria-pressed') === 'true')
  check('GIF is offered beside it', await chip('GIF').getAttribute('aria-pressed') === 'false')
  check('the MP4 blurb does not mention sound being lost',
    await page.getByText(/A GIF has no sound/).count() === 0)
}

console.log('\n── Choosing GIF says what it costs, before the button ───────')
{
  await chip('GIF').click()
  check('GIF is selected', await chip('GIF').getAttribute('aria-pressed') === 'true')
  check('the panel warns that a GIF is silent',
    await page.getByText(/A GIF has no sound/).isVisible())
  check('the queue’s target column will say gif',
    await page.getByText(/^480 px · 15 fps$/).isVisible())
}

console.log('\n── A real clip becomes a real GIF ───────────────────────────')
{
  const { downloads: got, file } = await convertToFile('out.gif')
  check('converting one file starts the download on its own', got.length === 1, `${got.length} downloads`)
  if (file) {
    check('the file is named .gif, not .mp4.gif', got[0].suggestedFilename() === 'clip.gif',
      got[0].suggestedFilename())
    const bytes = fs.readFileSync(file)
    check('it really is a GIF89a', bytes.subarray(0, 6).toString('latin1') === 'GIF89a',
      bytes.subarray(0, 6).toString('latin1'))
    check('it loops by default', bytes.includes(Buffer.from('NETSCAPE2.0', 'latin1')))

    const gif = probeGif(file)
    // 640×360 capped at 480 on the longest edge.
    check('the default size caps the longest edge at 480 px',
      gif.width === 480 && gif.height === 270, `${gif.width}×${gif.height}`)
    // Two seconds at 15 fps. The last frame's delay is nominal, so allow one
    // either way rather than pinning an exact count.
    check('the default frame rate is 15 a second', Math.abs(gif.frames - 30) <= 1, `${gif.frames} frames`)
    check('the animation is as long as the clip', Math.abs(gif.duration - 2) < 0.15, `${gif.duration}s`)
    check('a source with an audio track converts anyway', bytes.length > 1000, `${bytes.length} bytes`)
  }
}

console.log('\n── The settings do what they say ────────────────────────────')
{
  await openAdvanced()
  await page.getByRole('combobox').selectOption('240')
  await page.getByRole('button', { name: '10', exact: true }).click()
  await page.getByRole('switch', { name: /Loop forever/ }).click()

  const { file } = await convertToFile('small.gif')
  if (file) {
    const gif = probeGif(file)
    check('240 px is honoured', gif.width === 240 && gif.height === 135, `${gif.width}×${gif.height}`)
    check('10 fps is honoured', Math.abs(gif.frames - 20) <= 1, `${gif.frames} frames`)
    check('the animation still runs for the clip’s two seconds',
      Math.abs(gif.duration - 2) < 0.15, `${gif.duration}s`)
    check('turning off looping leaves the Netscape block out',
      !fs.readFileSync(file).includes(Buffer.from('NETSCAPE2.0', 'latin1')))
  }
}

console.log('\n── Trim is one window, not one per target ───────────────────')
{
  // Typed against GIF, then read back against MP4: the two targets share
  // `video.trim`, and switching must not lose it.
  await page.getByRole('switch', { name: /^Trim/ }).click()
  await page.getByRole('textbox', { name: /Start/ }).fill('0:01')
  await chip('MP4').click()
  await openAdvanced()
  const start = await page.getByRole('textbox', { name: /Start/ }).inputValue()
  check('a trim typed on GIF is still there on MP4', start === '0:01', start)

  await chip('GIF').click()
  const { file } = await convertToFile('trimmed.gif')
  if (file) {
    const gif = probeGif(file)
    check('trimming from one second halves the animation',
      Math.abs(gif.duration - 1) < 0.2, `${gif.duration}s`)
  }
}

check('no uncaught errors in the page', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

await browser.close()
server.kill()

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  · ${f}`)
  console.log(`\nThe fixtures and output are in ${TMP}`)
  process.exit(1)
}
fs.rmSync(TMP, { recursive: true, force: true })
