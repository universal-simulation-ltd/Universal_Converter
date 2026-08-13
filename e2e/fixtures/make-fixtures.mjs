// Build the sample documents the Files-tab test converts.
//
// The DOCX is written here by hand — it is a ZIP of XML, and writing it
// directly is how the test controls exactly which features are exercised
// (nested lists, a table, a hyperlink, tracked changes, smart quotes).
//
// The DOC, ODT and RTF are produced by LIBREOFFICE converting that DOCX,
// deliberately. A hand-written .doc would be a compound file shaped the way I
// imagined one, which proves nothing about the reader — the whole risk in
// `read/doc.ts` is that a REAL producer's piece table looks different from the
// spec's example. Same for RTF, where every producer emits a different subset.
//
//   node e2e/fixtures/make-fixtures.mjs

import { deflateRawSync, crc32 } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOFFICE = 'C:/Program Files/LibreOffice/program/soffice.exe'

// ── A minimal ZIP writer (deflate) ───────────────────────────────────────────

function zip(entries) {
  const locals = []
  const central = []
  let offset = 0

  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.from(content, 'utf8')
    const compressed = deflateRawSync(data)
    const crc = crc32(data) >>> 0
    const nameBytes = Buffer.from(name, 'utf8')

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    locals.push(local, nameBytes, compressed)

    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4)
    dir.writeUInt16LE(20, 6)
    dir.writeUInt16LE(8, 10)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(compressed.length, 20)
    dir.writeUInt32LE(data.length, 24)
    dir.writeUInt16LE(nameBytes.length, 28)
    dir.writeUInt32LE(offset, 42)
    central.push(dir, nameBytes)

    offset += local.length + nameBytes.length + compressed.length
  }

  const centralBuffer = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, centralBuffer, end])
}

// ── The DOCX ─────────────────────────────────────────────────────────────────

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W} ${R}><w:body>
  <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Quarterly Report</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Summary</w:t></w:r></w:p>
  <w:p>
    <w:r><w:t xml:space="preserve">This paragraph has </w:t></w:r>
    <w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r>
    <w:r><w:t xml:space="preserve">, </w:t></w:r>
    <w:r><w:rPr><w:i/></w:rPr><w:t>italic</w:t></w:r>
    <w:r><w:t xml:space="preserve"> and </w:t></w:r>
    <w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>underlined</w:t></w:r>
    <w:r><w:t xml:space="preserve"> text \u2014 plus a \u201Csmart quoted\u201D phrase.</w:t></w:r>
  </w:p>
  <w:p>
    <w:r><w:t xml:space="preserve">Bold OFF must stay off: </w:t></w:r>
    <w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>NOTBOLD</w:t></w:r>
  </w:p>
  <w:p>
    <w:r><w:t xml:space="preserve">A link to </w:t></w:r>
    <w:hyperlink r:id="rId9"><w:r><w:t>the suite</w:t></w:r></w:hyperlink>
    <w:r><w:t>.</w:t></w:r>
  </w:p>
  <w:p>
    <w:ins w:id="1" w:author="a"><w:r><w:t xml:space="preserve">INSERTEDTEXT </w:t></w:r></w:ins>
    <w:del w:id="2" w:author="a"><w:r><w:delText>DELETEDTEXT</w:delText></w:r></w:del>
  </w:p>
  <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>The list</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>First bullet</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Nested bullet</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Second bullet</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>Numbered one</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>Numbered two</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>The table</w:t></w:r></w:p>
  <w:tbl>
    <w:tr><w:tc><w:p><w:r><w:t>Region</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Revenue</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>North</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1200</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>South</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>950</w:t></w:r></w:p></w:tc></w:tr>
  </w:tbl>
  <w:p><w:r><w:br w:type="page"/></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>After the page break</w:t></w:r></w:p>
  <w:p><w:r><w:t>PAGETWOMARKER should be on the second page.</w:t></w:r></w:p>
</w:body></w:document>`

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
</w:styles>`

const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W}>
  <w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="20"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num>
</w:numbering>`

const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://opensource.unisim.co.uk/" TargetMode="External"/>
</Relationships>`

const corePropsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>Quarterly Report</dc:title><dc:creator>Universal Simulation</dc:creator>
</cp:coreProperties>`

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`

fs.writeFileSync(path.join(HERE, 'sample.docx'), zip({
  '[Content_Types].xml': contentTypesXml,
  '_rels/.rels': rootRelsXml,
  'docProps/core.xml': corePropsXml,
  'word/document.xml': documentXml,
  'word/styles.xml': stylesXml,
  'word/numbering.xml': numberingXml,
  'word/_rels/document.xml.rels': relsXml,
}))

// ── The text-shaped fixtures ─────────────────────────────────────────────────

fs.writeFileSync(path.join(HERE, 'sample.csv'),
  'Region,Revenue,Notes,Code\r\n' +
  'North,1200,"Strong quarter, up 8%",007\r\n' +
  'South,950,"He said ""no"" and left",A12\r\n' +
  'East,,"Multi\nline note",+44163\r\n')

// Semicolon-delimited, which is what a European Excel exports.
fs.writeFileSync(path.join(HERE, 'sample-semicolon.csv'),
  'Name;Score\r\nAlice;10\r\nBo;20\r\n')

fs.writeFileSync(path.join(HERE, 'sample.json'), JSON.stringify([
  { name: 'Alice', score: 10, active: true, note: null },
  { name: 'Bo', score: 20, active: false, extra: 'only on this row' },
], null, 2))

fs.writeFileSync(path.join(HERE, 'sample.md'), `# Markdown Sample

A paragraph with **bold**, *italic*, \`code\` and a [link](https://opensource.unisim.co.uk/).

## A list

- First
  - Nested
- Second

1. One
2. Two

| Column | Value |
| --- | --- |
| Alpha | 1 |
| Beta | 2 |

> A quotation that should get an orange bar.

\`\`\`
const answer = 42
\`\`\`

---

MDENDMARKER
`)

fs.writeFileSync(path.join(HERE, 'sample.html'), `<!doctype html>
<html><head><title>HTML Sample</title><style>p { color: red }</style></head>
<body>
  <h1>HTML Sample</h1>
  <p>A paragraph with <strong>bold</strong> and <a href="https://opensource.unisim.co.uk/">a link</a>.</p>
  <p>An escaped tag test: &lt;script&gt;alert(1)&lt;/script&gt;</p>
  <ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul>
  <table><thead><tr><th>H1</th><th>H2</th></tr></thead>
    <tbody><tr><td>a</td><td>b</td></tr></tbody></table>
  <blockquote>Quoted text</blockquote>
  <script>window.SHOULD_NOT_RUN = true</script>
  <p>HTMLENDMARKER</p>
</body></html>`)

fs.writeFileSync(path.join(HERE, 'sample.txt'),
  'A plain text file.\n\n' +
  'This block is hard wrapped at about seventy columns so that the\n' +
  'reader has to decide whether to join these lines back together\n' +
  'into one flowing paragraph, which is what it should do here.\n\n' +
  'TXTENDMARKER\n')

// ── An ODT with a real hard page break ───────────────────────────────────────
//
// A separate fixture because LibreOffice does NOT carry the DOCX's
// `<w:br w:type="page"/>` through its own export — `sample.odt` has no page
// break in it at all, so it cannot test the one thing that is interesting here.
// In ODF a hard break is `fo:break-before="page"` on the paragraph's STYLE,
// never an element in the body, so it is written by hand.
const odtContent = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="P1" style:family="paragraph">
      <style:paragraph-properties fo:break-before="page"/>
    </style:style>
    <style:style style:name="T1" style:family="text">
      <style:text-properties fo:font-weight="bold"/>
    </style:style>
  </office:automatic-styles>
  <office:body><office:text>
    <text:h text:outline-level="1">ODT Page One</text:h>
    <text:p>Text on the first page, with a <text:span text:style-name="T1">bold</text:span> word.</text:p>
    <text:p text:style-name="P1">ODTPAGETWOMARKER lives on the second page.</text:p>
  </office:text></office:body>
</office:document-content>`

fs.writeFileSync(path.join(HERE, 'sample-pagebreak.odt'), zip({
  'mimetype': 'application/vnd.oasis.opendocument.text',
  'content.xml': odtContent,
  'META-INF/manifest.xml': `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`,
}))

// ── LibreOffice: real DOC, ODT and RTF from that same DOCX ───────────────────

if (fs.existsSync(SOFFICE)) {
  for (const target of ['doc', 'odt', 'rtf']) {
    execFileSync(SOFFICE, [
      '--headless', '--norestore', '--convert-to', target, '--outdir', HERE,
      path.join(HERE, 'sample.docx'),
    ], { stdio: 'inherit', timeout: 180000 })
  }
  // And a real Word 97 .doc WITH a page break in it, from the ODT above —
  // LibreOffice turns `fo:break-before` into the 0x0C the old format uses,
  // which is the only way to exercise that branch of the piece-table reader
  // against bytes a real producer wrote.
  execFileSync(SOFFICE, [
    '--headless', '--norestore', '--convert-to', 'doc', '--outdir', HERE,
    path.join(HERE, 'sample-pagebreak.odt'),
  ], { stdio: 'inherit', timeout: 180000 })
} else {
  console.warn(`LibreOffice not at ${SOFFICE} — DOC/ODT/RTF fixtures not regenerated.`)
}

for (const name of fs.readdirSync(HERE).sort()) {
  if (name === 'make-fixtures.mjs') continue
  console.log(`${name.padEnd(24)} ${fs.statSync(path.join(HERE, name)).size} bytes`)
}
