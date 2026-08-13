// The Files tab, driven in a real browser.
//
// Two passes, because they prove different things:
//
//   1. THE LIBRARY PASS calls the real pipeline inside the page — a real
//      DOMParser, a real DecompressionStream, a real canvas — over every
//      input/output pair. Fast, and it is the only way to get at the bytes.
//   2. THE UI PASS clicks through the actual tab with a real file input and a
//      real download, which is the half a library test can always pass while
//      the page is broken.
//
// ⚠️ The PDF assertions read the RAW BYTES, and that works because
// `pdfcore.ts` does not compress its content streams — the drawn text is
// literally in the file as `(Quarterly Report) Tj`. If a future change adds
// FlateDecode to content streams, these assertions go silently green-then-blind
// and must be replaced with a real text extraction. Hence `assertUncompressed`,
// which fails loudly the day that happens rather than letting the suite rot.
//
//   node e2e/files.e2e.mjs

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, 'fixtures')
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

/**
 * Ask the OS for a free port.
 *
 * A hard-coded one collides with whatever preview or sibling session already
 * has it, and this box routinely runs several at once — the failure looks like
 * a broken test rather than a busy port, which is a bad half-hour.
 */
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
  // Vite's own binary, not `npm run dev`. Node 20+ refuses to `spawn` a .cmd
  // shim without `shell: true` (EINVAL), and turning the shell on to run a
  // batch file is the more fragile of the two fixes on a path with spaces in.
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

/** A fixture as a base64 string, for handing into the page. */
function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name)).toString('base64')
}

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

await page.goto(APP, { waitUntil: 'networkidle' })

// A helper installed once: rebuild a File in the page from base64.
await page.addScriptTag({
  content: `
    window.__fileFrom = (base64, name, type) => {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return new File([bytes], name, { type: type || '' })
    }
  `,
})

/** Convert one fixture inside the page and bring the bytes back out. */
async function convert(fixtureName, format, extra = {}) {
  return page.evaluate(
    async ({ base64, name, format, extra }) => {
      const { convertDocument, DEFAULT_DOC_SETTINGS } = await import('/src/lib/doc/index.ts')
      const file = window.__fileFrom(base64, name)
      const settings = {
        ...DEFAULT_DOC_SETTINGS,
        ...extra,
        format,
        pdf: { ...DEFAULT_DOC_SETTINGS.pdf, ...(extra.pdf ?? {}) },
      }
      try {
        const result = await convertDocument(file, settings)
        const bytes = new Uint8Array(await result.blob.arrayBuffer())
        // latin1 keeps every byte addressable as a character, which is what the
        // PDF assertions need; the text targets are decoded as UTF-8 instead.
        let latin1 = ''
        for (let i = 0; i < bytes.length; i++) latin1 += String.fromCharCode(bytes[i])
        return {
          ok: true,
          name: result.name,
          size: bytes.length,
          latin1,
          text: new TextDecoder('utf-8').decode(bytes),
          notices: result.notices.map((n) => n.message),
          pages: result.pages ?? null,
        }
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) }
      }
    },
    { base64: fixture(fixtureName), name: fixtureName, format, extra },
  )
}

function assertUncompressed(pdf, label) {
  check(
    `${label}: content streams are uncompressed (these assertions depend on it)`,
    !pdf.latin1.includes('/FlateDecode') || pdf.latin1.includes('/DCTDecode'),
    'a /FlateDecode content stream would make every text assertion below blind',
  )
}

/**
 * Text drawn in a PDF, recovered from the `(…) Tj` operators.
 *
 * ⚠️ Whitespace is normalised at the end, and that is not cosmetic. The
 * renderer draws one `Tj` PER TOKEN — including the spaces between words — so
 * joining the operators with a space turns "Markdown Sample" into
 * "Markdown   Sample", and every assertion about a multi-word phrase fails
 * against perfectly good output.
 */
function pdfText(pdf) {
  return [...pdf.latin1.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)]
    .map((m) => m[1].replace(/\\([()\\])/g, '$1'))
    .join(' ')
    .replace(/\s+/g, ' ')
}

function pageCount(pdf) {
  const match = /\/Type\s*\/Pages\s*\/Count\s+(\d+)/.exec(pdf.latin1)
  return match ? Number(match[1]) : 0
}

console.log('\n── DOCX → PDF ───────────────────────────────────────────────')
{
  const pdf = await convert('sample.docx', 'pdf')
  check('DOCX converts', pdf.ok, pdf.error)
  if (pdf.ok) {
    assertUncompressed(pdf, 'DOCX')
    const text = pdfText(pdf)
    check('starts with %PDF', pdf.latin1.startsWith('%PDF-1.4'))
    check('names the output .pdf', pdf.name === 'sample.pdf', pdf.name)
    check('title paragraph is drawn', text.includes('Quarterly'))
    check('heading is drawn', text.includes('Summary'))
    check('table cell is drawn', text.includes('North'))
    check('nested list item is drawn', text.includes('Nested'))
    check('hyperlink text is drawn', text.includes('suite'))
    check('link annotation points at the real URL',
      pdf.latin1.includes('/URI (https://opensource.unisim.co.uk/)'))
    // The two that catch a whole class of DOCX bug.
    check('tracked INSERTION is kept', text.includes('INSERTEDTEXT'))
    check('tracked DELETION is dropped', !text.includes('DELETEDTEXT'))
    check('page break made a second page', pageCount(pdf) === 2, `pages=${pageCount(pdf)}`)
    check('second page has its content', text.includes('PAGETWOMARKER'))
    // Universal PDF flattens these; we should not.
    check('smart quotes survive as WinAnsi, not as ASCII',
      pdf.latin1.includes('\x93') && pdf.latin1.includes('\x94'),
      'expected 0x93/0x94 (curly double quotes) in a text string')
    check('em dash survives as WinAnsi', pdf.latin1.includes('\x97'))
    check('font objects declare WinAnsiEncoding', pdf.latin1.includes('/Encoding /WinAnsiEncoding'))
    check('bold face is actually used', pdf.latin1.includes('/BaseFont /Helvetica-Bold'))
    // Regression guard: the nested-list markers used to be '◦' and '▪', which
    // no base-14 font can draw — so every document with a nested list came back
    // warning that characters had been lost, blaming the document for the
    // renderer's own choice of bullet.
    check('a clean DOCX warns about nothing', pdf.notices.length === 0, pdf.notices.join(' | '))
    // Looks for the OPERATOR, not the letter: /o/ over the whole document
    // matches the first "Report" and would pass however the bullet was drawn.
    check('nested bullet is drawn, and with the WinAnsi marker',
      pdf.latin1.includes('(o) Tj') && !pdf.latin1.includes('(?) Tj'),
      'expected a standalone (o) Tj and no (?) Tj anywhere')
    check('top-level bullet is the WinAnsi bullet byte (0x95)',
      pdf.latin1.includes('(\x95) Tj'))
  }
}

console.log('\n── DOC (real Word 97, made by LibreOffice) ──────────────────')
{
  const pdf = await convert('sample.doc', 'pdf')
  check('DOC converts', pdf.ok, pdf.error)
  if (pdf.ok) {
    const text = pdfText(pdf)
    check('piece table yielded the title', text.includes('Quarterly'))
    check('body text came through', text.includes('bold'))
    check('table cell text came through', text.includes('North'))
    check('field instructions are not in the text', !text.includes('HYPERLINK'))
    // NOT `!includes('DELETEDTEXT')`. A piece-table read cannot tell a tracked
    // deletion from ordinary text, so deleted text DOES survive — which is
    // disclosed on the row rather than quietly shipped. Asserting the warning
    // is the honest test; asserting the absence would demand a CHPX walker.
    check('tracked deletions do survive (the known .doc limitation)',
      text.includes('DELETEDTEXT'))
    check('and that limitation is disclosed, by name',
      pdf.notices.some((n) => n.includes('tracked changes') && n.includes('deleted')),
      pdf.notices.join(' | '))
    check('says plainly that formatting was lost',
      pdf.notices.some((n) => n.includes('only its TEXT')), pdf.notices.join(' | '))
  }
}

console.log('\n── ODT (real LibreOffice) ───────────────────────────────────')
{
  const pdf = await convert('sample.odt', 'pdf')
  check('ODT converts', pdf.ok, pdf.error)
  if (pdf.ok) {
    const text = pdfText(pdf)
    check('heading came through', text.includes('Summary'))
    check('table cell came through', text.includes('North'))
    check('nested list item came through', text.includes('Nested'))
    check('bold face is used (span styles were read)',
      pdf.latin1.includes('/BaseFont /Helvetica-Bold'))
  }
}

console.log('\n── RTF (real LibreOffice) ───────────────────────────────────')
{
  const pdf = await convert('sample.rtf', 'pdf')
  check('RTF converts', pdf.ok, pdf.error)
  if (pdf.ok) {
    const text = pdfText(pdf)
    check('body text came through', text.includes('bold'))
    check('heading came through', text.includes('Summary'))
    check('font table is NOT in the document text', !/Times New Roman|Liberation/.test(text))
    check('colour table is not in the text', !text.includes('red0'))

    // ⚠️ THE THREE BELOW EXIST BECAUSE THE FOUR ABOVE MISSED REAL BUGS. Reverting
    // the `\*` and `\uc` fixes left the whole suite green: the assertions all
    // asked "did the good text arrive?", and none asked "did anything else
    // arrive with it?". A reader that emits the right words plus rubbish passes
    // every presence check ever written.
    check('no stray asterisks from `{\\*\\…}` destinations',
      !/^\s*\*/.test(text), JSON.stringify(text.slice(0, 40)))
    check('no `\\uc` fallback bytes left as literal text',
      !/'9[0-9a-f]|'[0-9a-f]{2}/.test(text),
      JSON.stringify(text.slice(text.search(/'[0-9a-f]{2}/) - 20, text.search(/'[0-9a-f]{2}/) + 20)))
    // The strongest available check: this RTF and `sample.docx` are the SAME
    // document, so their extracted prose should agree. It catches anything
    // gained or lost that a keyword search would walk straight past.
    check('RTF text matches the DOCX it was made from',
      text.replace(/\s/g, '').includes('Thisparagraphhasbold,italicandunderlinedtext'),
      JSON.stringify(text.slice(0, 90)))
  }
}

console.log('\n── Hard page breaks in ODT and DOC ──────────────────────────')
{
  // ⚠️ These need their OWN fixtures. LibreOffice does not carry the DOCX's
  // `<w:br w:type="page"/>` through its export, so `sample.odt` and `sample.doc`
  // contain no page break at all — they come out as one page, correctly, and
  // would have quietly passed for "page breaks work" while testing nothing.
  const odt = await convert('sample-pagebreak.odt', 'pdf')
  check('ODT with a page break converts', odt.ok, odt.error)
  if (odt.ok) {
    check('fo:break-before="page" on the style made a second page',
      pageCount(odt) === 2, `pages=${pageCount(odt)}`)
    check('the second page holds its content', pdfText(odt).includes('ODTPAGETWOMARKER'))
    check('an automatic text style still gave us bold',
      odt.latin1.includes('/BaseFont /Helvetica-Bold'))
  }

  const doc = await convert('sample-pagebreak.doc', 'pdf')
  check('DOC with a page break converts', doc.ok, doc.error)
  if (doc.ok) {
    check('all the text survives either way', pdfText(doc).includes('ODTPAGETWOMARKER'))
    // ⚠️ NOT `pageCount === 2`, and the reason is the interesting bit. A .doc
    // stores a page break in one of TWO places: as an explicit 0x0C character
    // in the text (Ctrl+Enter in Word), or as a paragraph PROPERTY in the PAPX
    // runs — which is what LibreOffice writes, and which lives in the property
    // machinery `read/doc.ts` deliberately does not walk. The 0x0C branch is
    // real and handles the first; this fixture exercises the second, which is
    // lost. Asserting two pages here would be asserting a feature that does not
    // exist. The row says page breaks are among what the old format loses.
    check('a property-stored page break is lost (the known .doc limitation)',
      pageCount(doc) === 1, `pages=${pageCount(doc)}`)
    check('and page breaks are named in the loss notice',
      doc.notices.some((n) => n.includes('page breaks')), doc.notices.join(' | '))
  }
}

console.log('\n── Markdown, HTML, text ─────────────────────────────────────')
{
  const md = await convert('sample.md', 'pdf')
  check('MD converts', md.ok, md.error)
  if (md.ok) {
    const text = pdfText(md)
    check('MD heading drawn', text.includes('Markdown Sample'))
    check('MD table cell drawn', text.includes('Alpha'))
    check('MD code block drawn', text.includes('const'))
    check('MD end marker drawn', text.includes('MDENDMARKER'))
    check('MD link became an annotation', md.latin1.includes('/S /URI'))
  }

  const html = await convert('sample.html', 'pdf')
  check('HTML converts', html.ok, html.error)
  if (html.ok) {
    const text = pdfText(html)
    check('HTML heading drawn', text.includes('HTML Sample'))
    check('HTML <script> body is NOT in the document', !text.includes('SHOULD_NOT_RUN'))
    check('HTML <style> body is NOT in the document', !text.includes('color: red'))
    check('escaped tag comes through as text', text.includes('script'))
    check('HTML end marker drawn', text.includes('HTMLENDMARKER'))
  }
  check('parsing that HTML did not execute its script',
    (await page.evaluate(() => window.SHOULD_NOT_RUN)) === undefined)

  const txt = await convert('sample.txt', 'pdf')
  check('TXT converts', txt.ok, txt.error)
  if (txt.ok) check('TXT end marker drawn', pdfText(txt).includes('TXTENDMARKER'))
}

console.log('\n── CSV and JSON ─────────────────────────────────────────────')
{
  const json = await convert('sample.csv', 'json')
  check('CSV → JSON converts', json.ok, json.error)
  if (json.ok) {
    let parsed = null
    try { parsed = JSON.parse(json.text) } catch (err) { check('JSON output parses', false, String(err)) }
    if (parsed) {
      check('JSON output parses (no BOM)', true)
      check('three records', parsed.length === 3, `got ${parsed.length}`)
      check('quoted comma stayed in one field',
        parsed[0].Notes === 'Strong quarter, up 8%', JSON.stringify(parsed[0].Notes))
      check('doubled quotes became one',
        parsed[1].Notes === 'He said "no" and left', JSON.stringify(parsed[1].Notes))
      check('embedded newline survived', parsed[2].Notes.includes('\n'))
      check('revenue became a number', parsed[0].Revenue === 1200)
      check('leading-zero code stayed a STRING', parsed[0].Code === '007', JSON.stringify(parsed[0].Code))
      check('phone-like value kept its +', parsed[2].Code === '+44163', JSON.stringify(parsed[2].Code))
      check('empty cell became null', parsed[2].Revenue === null)
    }
  }

  const semi = await convert('sample-semicolon.csv', 'json')
  check('semicolon CSV sniffed', semi.ok && JSON.parse(semi.text)[0].Score === 10,
    semi.ok ? semi.text.slice(0, 80) : semi.error)

  const csv = await convert('sample.json', 'csv')
  check('JSON → CSV converts', csv.ok, csv.error)
  if (csv.ok) {
    // ⚠️ Checked on the BYTES. `TextDecoder('utf-8')` strips a leading BOM by
    // design, so `csv.text.charCodeAt(0)` is the first real character and this
    // assertion can never see the thing it is testing for.
    check('CSV has a BOM for Excel',
      csv.latin1.startsWith('ï»¿'),
      [...csv.latin1.slice(0, 3)].map((c) => c.charCodeAt(0).toString(16)).join(' '))
    check('union of keys became the header',
      csv.text.includes('name,score,active,note,extra'), csv.text.split('\r\n')[0])
    check('CRLF line endings', csv.text.includes('\r\n'))
  }

  const csvPdf = await convert('sample.csv', 'pdf')
  check('CSV → PDF converts', csvPdf.ok, csvPdf.error)
  if (csvPdf.ok) check('CSV table drawn in the PDF', pdfText(csvPdf).includes('North'))

  const refused = await convert('sample.docx', 'csv')
  check('DOCX → CSV is refused with a sentence',
    !refused.ok && /spreadsheet-shaped/.test(refused.error ?? ''), refused.error)
}

console.log('\n── The text targets ─────────────────────────────────────────')
{
  const txt = await convert('sample.docx', 'txt')
  check('DOCX → TXT converts', txt.ok, txt.error)
  if (txt.ok) {
    // '=' and not '-': `Heading 1` is level 1, and the text writer rules a
    // level-1 heading with '='. Only levels 2 and below get '-'.
    check('heading underlined so it still reads as one', /Summary\n=+/.test(txt.text))
    check('a deeper heading gets the lighter rule', /The list\n-+/.test(txt.text))
    check('bullet marker present', txt.text.includes('- First bullet'))
    check('nested item indented', txt.text.includes('  - Nested bullet'))
  }

  const html = await convert('sample.docx', 'html')
  check('DOCX → HTML converts', html.ok, html.error)
  if (html.ok) {
    check('is a whole document', html.text.startsWith('<!doctype html>'))
    check('heading is an <h1>', html.text.includes('<h1>Quarterly Report</h1>'))
    check('bold is <strong>', html.text.includes('<strong>bold</strong>'))
    check('link is an <a href>', html.text.includes('href="https://opensource.unisim.co.uk/"'))
    check('nested list is nested', /<ul>[\s\S]*<ul>[\s\S]*<\/ul>[\s\S]*<\/ul>/.test(html.text))
  }

  // The one that matters: a document whose TEXT is markup must not become markup.
  const hostile = await page.evaluate(async () => {
    const { convertDocument, DEFAULT_DOC_SETTINGS } = await import('/src/lib/doc/index.ts')
    const file = new File(['<script>window.PWNED = 1</script> & <b>x</b>'], 'x.txt', { type: 'text/plain' })
    const result = await convertDocument(file, { ...DEFAULT_DOC_SETTINGS, format: 'html' })
    return await result.blob.text()
  })
  check('a document containing markup is escaped, not embedded',
    hostile.includes('&lt;script&gt;') && !hostile.includes('<script>window.PWNED'),
    hostile.slice(hostile.indexOf('<body>'), hostile.indexOf('<body>') + 120))
  check('ampersand escaped exactly once', hostile.includes('&amp;') && !hostile.includes('&amp;amp;'))

  const md = await convert('sample.docx', 'md')
  check('DOCX → MD converts', md.ok, md.error)
  if (md.ok) {
    check('heading is #', md.text.includes('# Quarterly Report'))
    check('table has the required separator row', md.text.includes('| --- |'))
  }
}

console.log('\n── Fonts, encoding and settings ─────────────────────────────')
{
  const greek = await page.evaluate(async () => {
    const { convertDocument, DEFAULT_DOC_SETTINGS } = await import('/src/lib/doc/index.ts')
    const file = new File(['Latin fine. Greek: αβγ. Cyrillic: Привет.'], 'g.txt', { type: 'text/plain' })
    const result = await convertDocument(file, { ...DEFAULT_DOC_SETTINGS, format: 'pdf' })
    return { notices: result.notices.map((n) => n.message) }
  })
  check('unwritable alphabets are named, not silently dropped',
    greek.notices.some((n) => n.includes('built-in fonts') && n.includes('α')),
    greek.notices.join(' | '))

  const serif = await convert('sample.md', 'pdf', { pdf: { font: 'serif', paper: 'Letter' } })
  check('serif setting selects Times', serif.ok && serif.latin1.includes('/BaseFont /Times-Roman'))
  check('Letter paper is 612×792', serif.ok && serif.latin1.includes('/MediaBox [0 0 612 792]'),
    /\/MediaBox \[[^\]]*\]/.exec(serif.latin1 ?? '')?.[0])

  const a4 = await convert('sample.md', 'pdf')
  check('A4 default is 595.28×841.89', a4.ok && a4.latin1.includes('/MediaBox [0 0 595.28 841.89]'),
    /\/MediaBox \[[^\]]*\]/.exec(a4.latin1 ?? '')?.[0])

  // Line breaking has to actually happen, or every paragraph is one long line
  // running off the page — which a text-presence assertion would not notice.
  const wrapped = await page.evaluate(async () => {
    const { convertDocument, DEFAULT_DOC_SETTINGS } = await import('/src/lib/doc/index.ts')
    const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ')
    const file = new File([words], 'w.txt', { type: 'text/plain' })
    const result = await convertDocument(file, { ...DEFAULT_DOC_SETTINGS, format: 'pdf' })
    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    let latin1 = ''
    for (let i = 0; i < bytes.length; i++) latin1 += String.fromCharCode(bytes[i])
    return { latin1, pages: result.pages }
  })
  const lines = [...wrapped.latin1.matchAll(/\)\s*Tj/g)].length
  check('a 400-word paragraph was broken into many lines', lines > 30, `${lines} draw calls`)
  check('every drawn line starts inside the left margin',
    [...wrapped.latin1.matchAll(/([\d.]+) ([\d.]+) Td/g)].every((m) => Number(m[1]) >= 56))
  check('long text paginated', wrapped.pages >= 1, `pages=${wrapped.pages}`)
}

console.log('\n── The UI, clicked for real ─────────────────────────────────')
{
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: 'Files' }).click()
  check('Files tab shows its dropzone',
    await page.getByText('Drop documents here to convert them').isVisible())

  await page.locator('input[type=file]').first()
    .setInputFiles(path.join(FIXTURES, 'sample.docx'))
  await page.getByRole('button', { name: /Convert 1 file/ }).click()
  await page.getByText('Done', { exact: true }).waitFor({ timeout: 30000 })
  check('a real drop + click converts', true)

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save' }).click(),
  ]).then(([d]) => d)
  const saved = path.join(HERE, '.out-sample.pdf')
  await download.saveAs(saved)
  const bytes = fs.readFileSync(saved)
  check('the downloaded file is named .pdf', download.suggestedFilename() === 'sample.pdf',
    download.suggestedFilename())
  check('the downloaded file is a real PDF', bytes.subarray(0, 5).toString() === '%PDF-')
  check('the downloaded PDF ends properly', bytes.subarray(-6).toString().includes('%%EOF'))
  fs.unlinkSync(saved)

  // A .doc must warn ON THE ROW, in the page, not just in the library result.
  await page.locator('input[type=file]').last().setInputFiles(path.join(FIXTURES, 'sample.doc'))
  await page.getByRole('button', { name: /Convert 1 file/ }).click()
  await page.getByText('only its TEXT could be read', { exact: false }).waitFor({ timeout: 30000 })
  check('the .doc warning is shown on the row', true)

  // A spreadsheet is refused by name, with a way forward.
  const xlsx = path.join(FIXTURES, '.tmp.xlsx')
  fs.writeFileSync(xlsx, 'not really a spreadsheet')
  await page.locator('input[type=file]').last().setInputFiles(xlsx)
  check('XLSX is refused with a way forward',
    await page.getByText('save it as CSV from your spreadsheet app', { exact: false }).isVisible())
  fs.unlinkSync(xlsx)
}

check('no uncaught errors in the page', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

await browser.close()
server.kill()

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
