// ---------------------------------------------------------------------------
// DOCX → RichDoc.
//
// A .docx is a ZIP of XML. The body is `word/document.xml`; what a paragraph's
// style *means* is in `styles.xml`; whether a list is bulleted or numbered is
// in `numbering.xml`; and where a hyperlink or an image actually points is in
// `word/_rels/document.xml.rels`. Reading the body alone gets you text with
// every heading flattened, every list bulleted and every link dead, so all four
// are read.
//
// THE PARTS THIS DELIBERATELY LEAVES BEHIND
// -----------------------------------------
// Headers and footers, footnotes, comments, tracked-change history, text boxes,
// charts, equations, columns, and anything positioned rather than flowed. Each
// is either a different document (a footer is not body text) or needs a layout
// model far past what the writer here can honour — and a footer silently
// appearing as a paragraph in the middle of page one is worse than not having
// it. Where one is present and dropped, it is NAMED in a notice, so the loss
// arrives with the file rather than being found later.
// ---------------------------------------------------------------------------

import {
  addNotice, mergeRuns, tidy,
  type Block, type ListItem, type RichDoc, type Run,
} from '../model'
import { ZipArchive } from '../unzip'
import { attr, child, children, descendant, descendants, onOff, parseXml } from '../xml'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const DC = 'http://purl.org/dc/elements/1.1/'

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  bmp: 'image/bmp', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff',
  emf: 'image/emf', wmf: 'image/wmf', svg: 'image/svg+xml',
}

/** Formats a reader can't rasterise, so the page would be blank where they are. */
const UNDRAWABLE = new Set(['emf', 'wmf', 'tif', 'tiff'])

export async function readDocx(file: File): Promise<RichDoc> {
  const zip = await ZipArchive.open(file)

  const documentXml = await zip.textOf('word/document.xml')
  if (!documentXml) {
    // A .doc renamed to .docx is the overwhelmingly common cause, and the two
    // are completely different formats rather than versions of one.
    throw new Error('This isn’t a Word .docx inside — it may be an old .doc renamed.')
  }

  const doc: RichDoc = { blocks: [], notices: [] }
  const rels = await readRelationships(zip)
  const styles = await readStyleNames(zip)
  const numbering = await readNumbering(zip)
  await readCoreProperties(zip, doc)

  const body = child(parseXml(documentXml, 'document'), W, 'document')
  const root = body ? child(body, W, 'body') : null
  if (!root) throw new Error('This Word file has no body to read.')

  const ctx: Ctx = { zip, rels, styles, numbering, doc }
  await readBlocks(root, ctx, doc.blocks)

  noteWhatWasLeftBehind(zip, doc)
  return tidy(doc)
}

interface Ctx {
  zip: ZipArchive
  rels: Map<string, { target: string; external: boolean }>
  styles: Map<string, string>
  numbering: Map<string, boolean>
  doc: RichDoc
}

// ── The body ─────────────────────────────────────────────────────────────────

/**
 * Walk `w:body` (or a table cell, which has the same content model).
 *
 * List items are gathered as they go: Word has no list ELEMENT — consecutive
 * paragraphs that happen to share a `numId` are a list — so a run of them is
 * accumulated and flushed the moment something that is not one comes along.
 */
async function readBlocks(root: Element, ctx: Ctx, out: Block[]): Promise<void> {
  let pending: { ordered: boolean; items: ListItem[] } | null = null

  const flush = () => {
    if (pending?.items.length) out.push({ kind: 'list', ordered: pending.ordered, items: pending.items })
    pending = null
  }

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType !== 1) continue
    const el = node as Element
    if (el.namespaceURI !== W) continue

    if (el.localName === 'p') {
      const para = await readParagraph(el, ctx)
      if (para.list) {
        // A change of kind (bullet → numbered) starts a new list; a change of
        // level does not, because that is the same list indenting.
        if (!pending || pending.ordered !== para.list.ordered) {
          flush()
          pending = { ordered: para.list.ordered, items: [] }
        }
        pending.items.push({ runs: para.runs, level: para.list.level })
        continue
      }
      flush()
      out.push(...para.blocks)
      continue
    }

    if (el.localName === 'tbl') {
      flush()
      out.push(await readTable(el, ctx))
      continue
    }

    if (el.localName === 'sdt') {
      // A content control — a date picker, a dropdown, a citation. The value
      // sits in `sdtContent`, which is ordinary body content.
      const content = child(el, W, 'sdtContent')
      if (content) await readBlocks(content, ctx, out)
      continue
    }
  }

  flush()
}

interface Paragraph {
  runs: Run[]
  blocks: Block[]
  list: { ordered: boolean; level: number } | null
}

async function readParagraph(el: Element, ctx: Ctx): Promise<Paragraph> {
  const props = child(el, W, 'pPr')
  const styleId = (props ? attr(child(props, W, 'pStyle'), W, 'val') : null) ?? ''
  const runs = await readRuns(el, ctx)
  const blocks: Block[] = []

  // Images are block-level here even when Word floats them inline. A picture
  // wrapped by text needs a layout model with float support; putting it on its
  // own line keeps the reading order right, which is the part that matters.
  const images = await readImages(el, ctx)

  const list = readListMembership(props, ctx)
  if (list) return { runs, blocks, list }

  const heading = headingLevel(styleId, ctx.styles, props)
  if (heading) {
    blocks.push({ kind: 'heading', level: heading, runs: mergeRuns(runs) })
  } else if (isQuote(styleId, ctx.styles)) {
    blocks.push({ kind: 'quote', runs: mergeRuns(runs) })
  } else if (runs.length || !images.length) {
    blocks.push({ kind: 'paragraph', runs: mergeRuns(runs) })
  }

  blocks.push(...images)

  // A hard page break lands on the paragraph that follows it in Word's model,
  // so it is emitted before this paragraph's own content.
  if (hasPageBreak(el)) blocks.unshift({ kind: 'pagebreak' })

  return { runs, blocks, list: null }
}

/**
 * Runs, hyperlinks and breaks, in document order.
 *
 * ⚠️ `w:del` — a tracked deletion — is SKIPPED, and skipping it is not an
 * optimisation. Its text lives in `w:delText` and is what the author took OUT;
 * including it puts deleted sentences back into the document, interleaved with
 * the ones that replaced them. `w:ins` is the opposite case and IS included,
 * because an accepted-looking insertion is what the document says now.
 */
async function readRuns(parent: Element, ctx: Ctx, inherited: Partial<Run> = {}): Promise<Run[]> {
  const out: Run[] = []

  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType !== 1) continue
    const el = node as Element
    if (el.namespaceURI !== W) continue

    switch (el.localName) {
      case 'r':
        out.push(...readRun(el, inherited))
        break

      case 'hyperlink': {
        // Only an EXTERNAL relationship becomes a link. The other kind is
        // `w:anchor`, a jump to a bookmark inside a document this has since
        // repaginated into different pages — so its text stays and its link
        // does not, rather than shipping a hotspot that goes nowhere.
        const id = attr(el, R, 'id')
        const rel = id ? ctx.rels.get(id) : null
        const href = rel?.external ? rel.target : undefined
        out.push(...(await readRuns(el, ctx, { ...inherited, link: href })))
        break
      }

      case 'ins':
      case 'smartTag':
      case 'bdo':
        out.push(...(await readRuns(el, ctx, inherited)))
        break

      case 'sdt': {
        const content = child(el, W, 'sdtContent')
        if (content) out.push(...(await readRuns(content, ctx, inherited)))
        break
      }

      case 'del':
        break

      default:
        break
    }
  }

  return out
}

function readRun(el: Element, inherited: Partial<Run>): Run[] {
  const props = child(el, W, 'rPr')
  const style: Partial<Run> = {
    ...inherited,
    bold: (props ? onOff(child(props, W, 'b'), W) : false) || inherited.bold,
    italic: (props ? onOff(child(props, W, 'i'), W) : false) || inherited.italic,
    strike: (props ? onOff(child(props, W, 'strike'), W) : false) || inherited.strike,
  }
  // `w:u` carries the LINE STYLE in its value, and "none" is a real value used
  // to switch inherited underlining off — so this one is not an on/off toggle
  // and `onOff` would read `<w:u w:val="none"/>` as underlined.
  const underline = props ? attr(child(props, W, 'u'), W, 'val') : null
  if (underline && underline !== 'none') style.underline = true
  // Word marks inline code with a character style rather than a font run, and
  // these are the ids the common exporters use.
  const runStyle = (props ? attr(child(props, W, 'rStyle'), W, 'val') : null) ?? ''
  if (/^(HTMLCode|Code|SourceText|VerbatimChar)$/i.test(runStyle)) style.code = true

  const out: Run[] = []
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType !== 1) continue
    const part = node as Element
    if (part.namespaceURI !== W) continue

    if (part.localName === 't') {
      out.push({ ...style, text: part.textContent ?? '' })
    } else if (part.localName === 'tab') {
      out.push({ ...style, text: '  ' })
    } else if (part.localName === 'br') {
      // A page break is handled at paragraph level; a plain break is a newline
      // inside one paragraph, which the writers turn back into a line break.
      if (attr(part, W, 'type') !== 'page') out.push({ ...style, text: '\n' })
    } else if (part.localName === 'noBreakHyphen') {
      out.push({ ...style, text: '-' })
    } else if (part.localName === 'sym') {
      // A symbol-font character — Wingdings, mostly, for a tick or a bullet.
      // The character code is meaningless outside its font, so it becomes a
      // bullet rather than a random Latin letter.
      out.push({ ...style, text: '•' })
    }
  }
  return out
}

// ── Structure ────────────────────────────────────────────────────────────────

/**
 * A paragraph's heading level, or null.
 *
 * Three signals, because one is not enough: the built-in style IDs are stable
 * (`Heading1`) but a localised Word writes `berschrift1`; the human-readable
 * name in `styles.xml` catches those; and `w:outlineLvl` catches a custom style
 * that a template author made behave as a heading without naming it one.
 */
function headingLevel(styleId: string, styles: Map<string, string>, props: Element | null): 1 | 2 | 3 | 4 | null {
  const clamp = (n: number): 1 | 2 | 3 | 4 => (Math.min(4, Math.max(1, n)) as 1 | 2 | 3 | 4)

  const byId = /^heading([1-9])$/i.exec(styleId.replace(/[-_\s]/g, ''))
  if (byId) return clamp(Number(byId[1]))
  if (/^title$/i.test(styleId)) return 1
  if (/^subtitle$/i.test(styleId)) return 2

  const name = styles.get(styleId) ?? ''
  const byName = /heading\s*([1-9])/i.exec(name)
  if (byName) return clamp(Number(byName[1]))
  if (/^title$/i.test(name)) return 1

  const outline = props ? attr(child(props, W, 'outlineLvl'), W, 'val') : null
  if (outline !== null) {
    const level = Number(outline)
    // `outlineLvl` is 0-based, and 9 is its way of saying "body text".
    if (Number.isFinite(level) && level <= 3) return clamp(level + 1)
  }
  return null
}

function isQuote(styleId: string, styles: Map<string, string>): boolean {
  const name = styles.get(styleId) ?? styleId
  return /^(intense\s*)?quote$/i.test(name.replace(/[-_]/g, ' ')) || /blockquote/i.test(name)
}

function readListMembership(props: Element | null, ctx: Ctx): { ordered: boolean; level: number } | null {
  if (!props) return null
  const numPr = child(props, W, 'numPr')
  if (!numPr) return null
  const numId = attr(child(numPr, W, 'numId'), W, 'val')
  // `numId="0"` is Word's way of saying "this paragraph was removed from its
  // list" — a real value that means not-a-list.
  if (!numId || numId === '0') return null
  const level = Number(attr(child(numPr, W, 'ilvl'), W, 'val') ?? '0')
  return {
    ordered: ctx.numbering.get(numId) ?? false,
    level: Number.isFinite(level) ? Math.min(4, Math.max(0, level)) : 0,
  }
}

function hasPageBreak(el: Element): boolean {
  return descendants(el, W, 'br').some((br) => attr(br, W, 'type') === 'page')
}

async function readTable(el: Element, ctx: Ctx): Promise<Block> {
  const rows: Run[][][] = []
  for (const tr of children(el, W, 'tr')) {
    const cells: Run[][] = []
    for (const tc of children(tr, W, 'tc')) {
      const runs: Run[] = []
      for (const p of children(tc, W, 'p')) {
        if (runs.length) runs.push({ text: '\n' })
        runs.push(...(await readRuns(p, ctx)))
      }
      cells.push(mergeRuns(runs))
    }
    if (cells.length) rows.push(cells)
  }

  if (!rows.length) return { kind: 'paragraph', runs: [{ text: ' ' }] }

  // Word marks a header row with `tblHeader` on its properties. Where nothing
  // says so, the first row is treated as the header — which is what a reader
  // assumes looking at it, and what every one of these tables turns out to be.
  const firstRow = children(el, W, 'tr')[0]
  const marked = firstRow ? descendant(firstRow, W, 'tblHeader') !== null : false
  const useHeader = marked || rows.length > 1
  return {
    kind: 'table',
    header: useHeader ? rows[0] : null,
    rows: useHeader ? rows.slice(1) : rows,
  }
}

// ── Images ───────────────────────────────────────────────────────────────────

async function readImages(el: Element, ctx: Ctx): Promise<Block[]> {
  const out: Block[] = []
  const ids: string[] = []

  // The modern path: DrawingML, where the bitmap is named by `a:blip/@r:embed`.
  for (const blip of descendants(el, A, 'blip')) {
    const id = attr(blip, R, 'embed')
    if (id) ids.push(id)
  }
  // The 1997-era path, still emitted for anything pasted from an old document.
  for (const data of Array.from(el.getElementsByTagName('v:imagedata'))) {
    const id = attr(data, R, 'id')
    if (id) ids.push(id)
  }

  for (const id of ids) {
    const rel = ctx.rels.get(id)
    if (!rel || rel.external) continue
    const path = rel.target.startsWith('/') ? rel.target.slice(1) : `word/${rel.target}`
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    if (UNDRAWABLE.has(ext)) {
      addNotice(ctx.doc, `A ${ext.toUpperCase()} drawing was left out — browsers can’t open that picture format.`)
      continue
    }
    const blob = await ctx.zip.blobOf(path, IMAGE_MIME[ext] ?? 'application/octet-stream')
    if (blob) out.push({ kind: 'image', file: blob, alt: '' })
  }

  return out
}

// ── The side parts ───────────────────────────────────────────────────────────

async function readRelationships(zip: ZipArchive): Promise<Map<string, { target: string; external: boolean }>> {
  const map = new Map<string, { target: string; external: boolean }>()
  const xml = await zip.textOf('word/_rels/document.xml.rels')
  if (!xml) return map
  const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships'
  for (const rel of descendants(parseXml(xml, 'relationships'), RELS, 'Relationship')) {
    const id = rel.getAttribute('Id')
    const target = rel.getAttribute('Target')
    if (!id || !target) continue
    map.set(id, { target, external: rel.getAttribute('TargetMode') === 'External' })
  }
  return map
}

/** styleId → the human-readable name, for the heading heuristics. */
async function readStyleNames(zip: ZipArchive): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const xml = await zip.textOf('word/styles.xml')
  if (!xml) return map
  for (const style of descendants(parseXml(xml, 'styles'), W, 'style')) {
    const id = attr(style, W, 'styleId')
    const name = attr(child(style, W, 'name'), W, 'val')
    if (id && name) map.set(id, name)
  }
  return map
}

/**
 * numId → is it a numbered list?
 *
 * Two hops, and the indirection is the point: `w:num` is an instance, which
 * points at an `w:abstractNum` definition, which holds the format per level.
 * Two lists sharing one definition is normal, so reading the format off the
 * instance is not possible. Level 0's format decides — a list that is numbered
 * at the top and bulleted underneath is a design nobody has, and the model
 * carries one flag per list.
 */
async function readNumbering(zip: ZipArchive): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>()
  const xml = await zip.textOf('word/numbering.xml')
  if (!xml) return map
  const doc = parseXml(xml, 'numbering')

  const abstract = new Map<string, boolean>()
  for (const def of descendants(doc, W, 'abstractNum')) {
    const id = attr(def, W, 'abstractNumId')
    if (!id) continue
    const level0 = children(def, W, 'lvl').find((l) => (attr(l, W, 'ilvl') ?? '0') === '0')
    const format = attr(child(level0 ?? def, W, 'numFmt'), W, 'val') ?? 'bullet'
    abstract.set(id, format !== 'bullet' && format !== 'none')
  }

  for (const num of descendants(doc, W, 'num')) {
    const id = attr(num, W, 'numId')
    const target = attr(child(num, W, 'abstractNumId'), W, 'val')
    if (id && target) map.set(id, abstract.get(target) ?? false)
  }
  return map
}

async function readCoreProperties(zip: ZipArchive, doc: RichDoc): Promise<void> {
  const xml = await zip.textOf('docProps/core.xml')
  if (!xml) return
  const props = parseXml(xml, 'properties')
  doc.title = descendant(props, DC, 'title')?.textContent?.trim() || undefined
  doc.author = descendant(props, DC, 'creator')?.textContent?.trim() || undefined
}

/**
 * Name what was in the file and is not in the result.
 *
 * Checked from the ARCHIVE rather than the body, because that is where the
 * evidence is: a footer part exists or it does not, and no amount of walking
 * `document.xml` reveals one.
 */
function noteWhatWasLeftBehind(zip: ZipArchive, doc: RichDoc): void {
  const names = zip.names
  const has = (pattern: RegExp) => names.some((n) => pattern.test(n))

  if (has(/^word\/(header|footer)\d*\.xml$/)) {
    addNotice(doc, 'Headers and footers were left out — they repeat per page, and this repaginates.')
  }
  // ⚠️ NOT footnotes. Word ships an empty `footnotes.xml` in almost every
  // document it saves — it holds the separator marks, not any notes — so
  // testing for the part announces a loss on documents that never had one, and
  // a notice that cries wolf is worse than no notice. Saying so properly means
  // parsing the part and counting real notes, which is not worth a second pass.
  if (has(/^word\/comments\.xml$/)) {
    addNotice(doc, 'Comments were left out — the document text is here, the margin notes are not.')
  }
  if (has(/^word\/charts?\//) || has(/^word\/embeddings\//)) {
    addNotice(doc, 'A chart or embedded object was left out — those aren’t pictures, and can’t be drawn here.')
  }
}
