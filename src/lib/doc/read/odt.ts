// ---------------------------------------------------------------------------
// ODT (OpenDocument Text) → RichDoc.
//
// LibreOffice's and OpenOffice's native format, and what Google Docs gives you
// if you ask for anything other than .docx. Structurally it is the same bargain
// as DOCX — a ZIP of XML — which is why it cost one file rather than a rewrite:
// the reader below is the same shape as `docx.ts`, over a vocabulary that is
// mostly nicer.
//
// TWO PLACES IT IS GENUINELY EASIER THAN DOCX
// -------------------------------------------
//   * `<text:h text:outline-level="2">` says it is a heading and how deep,
//     in the element itself. No style table, no three-way heuristic.
//   * `<text:list>` is a real element that CONTAINS its items, rather than
//     DOCX's run of sibling paragraphs that happen to share a numbering id.
//
// And one where it is worse: whether a list is bulleted or numbered lives in
// the list's STYLE, in a different part of the file, so that lookup comes back.
// ---------------------------------------------------------------------------

import {
  addNotice, mergeRuns, tidy,
  type Block, type ListItem, type RichDoc, type Run,
} from '../model'
import { ZipArchive } from '../unzip'
import { attr, child, children, descendant, descendants, parseXml } from '../xml'

const OFFICE = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0'
const TEXT = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
const TABLE = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0'
const DRAW = 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0'
const STYLE = 'urn:oasis:names:tc:opendocument:xmlns:style:1.0'
const FO = 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0'
const XLINK = 'http://www.w3.org/1999/xlink'
const DC = 'http://purl.org/dc/elements/1.1/'
const META = 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0'

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml',
}

export async function readOdt(file: File): Promise<RichDoc> {
  const zip = await ZipArchive.open(file)

  const contentXml = await zip.textOf('content.xml')
  if (!contentXml) throw new Error('This isn’t an OpenDocument file inside — `content.xml` is missing.')

  const doc: RichDoc = { blocks: [], notices: [] }
  const content = parseXml(contentXml, 'content')
  const styles = readTextStyles(content, await zip.textOf('styles.xml'))
  await readMeta(zip, doc)

  const body = descendant(content, OFFICE, 'text')
  if (!body) throw new Error('This OpenDocument file has no text body.')

  const ctx: Ctx = { zip, styles, breakBefore: pageBreakStyles.get(content) ?? new Set(), doc }
  await readBlocks(body, ctx, doc.blocks)

  if (descendant(content, TEXT, 'note')) {
    addNotice(doc, 'Footnotes were left out — this repaginates, so their page anchors no longer apply.')
  }
  if (descendant(content, DRAW, 'object')) {
    addNotice(doc, 'A chart or embedded object was left out — those aren’t pictures, and can’t be drawn here.')
  }

  return tidy(doc)
}

interface Ctx {
  zip: ZipArchive
  /** List style name → whether a list using it is numbered. */
  styles: Map<string, boolean>
  /** Paragraph style names that start a new page. */
  breakBefore: Set<string>
  doc: RichDoc
}

/**
 * Paragraph style names carrying `fo:break-before="page"`.
 *
 * Kept in a module-level map keyed by the content document for the same reason
 * `spanFormats` is: `readTextStyles` scans both style parts in one pass and can
 * only return one thing.
 */
const pageBreakStyles = new WeakMap<Document, Set<string>>()

async function readBlocks(root: Element, ctx: Ctx, out: Block[]): Promise<void> {
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType !== 1) continue
    const el = node as Element

    if (el.namespaceURI === TEXT) {
      switch (el.localName) {
        case 'h': {
          const raw = Number(attr(el, TEXT, 'outline-level') ?? '1')
          const level = (Math.min(4, Math.max(1, Number.isFinite(raw) ? raw : 1)) as 1 | 2 | 3 | 4)
          out.push({ kind: 'heading', level, runs: mergeRuns(await readRuns(el, ctx)) })
          continue
        }
        case 'p': {
          const runs = mergeRuns(await readRuns(el, ctx))
          const images = await readImages(el, ctx)
          const styleName = attr(el, TEXT, 'style-name') ?? ''
          // ⚠️ A HARD page break in ODF is a PARAGRAPH PROPERTY, not an element:
          // `fo:break-before="page"` on the style this paragraph uses. Only the
          // *soft* break — where LibreOffice's own layout happened to land last
          // time — appears in the body, and that one is ignored. Reading only
          // the body therefore loses every deliberate page break in the file.
          if (ctx.breakBefore.has(styleName)) out.push({ kind: 'pagebreak' })
          if (runs.length) {
            out.push(
              /quotation|blockquote/i.test(styleName)
                ? { kind: 'quote', runs }
                : { kind: 'paragraph', runs },
            )
          } else if (!images.length) {
            out.push({ kind: 'paragraph', runs: [{ text: ' ' }] })
          }
          out.push(...images)
          continue
        }
        case 'list':
        case 'numbered-paragraph': {
          const items: ListItem[] = []
          await readListItems(el, ctx, items, 0)
          if (items.length) {
            const styleName = attr(el, TEXT, 'style-name') ?? ''
            out.push({ kind: 'list', ordered: ctx.styles.get(styleName) ?? false, items })
          }
          continue
        }
        case 'section':
        case 'list-header':
          await readBlocks(el, ctx, out)
          continue
        case 'soft-page-break':
          // A RENDERING artefact — where LibreOffice's own layout happened to
          // break the page last time it was opened, not an instruction. Honouring
          // it would scatter page breaks through a document that has none.
          continue
        default:
          continue
      }
    }

    if (el.namespaceURI === TABLE && el.localName === 'table') {
      out.push(await readTable(el, ctx))
      continue
    }

    if (el.namespaceURI === TEXT && el.localName === 'table-of-content') continue
  }
}

/** Items, recursing into nested lists so indentation survives. */
async function readListItems(list: Element, ctx: Ctx, out: ListItem[], level: number): Promise<void> {
  for (const item of children(list, TEXT, 'list-item')) {
    for (const node of Array.from(item.childNodes)) {
      if (node.nodeType !== 1) continue
      const el = node as Element
      if (el.namespaceURI !== TEXT) continue
      if (el.localName === 'p' || el.localName === 'h') {
        out.push({ runs: mergeRuns(await readRuns(el, ctx)), level })
      } else if (el.localName === 'list') {
        await readListItems(el, ctx, out, Math.min(4, level + 1))
      }
    }
  }
}

/**
 * Inline content.
 *
 * The one thing worth knowing: ODF does not put runs of spaces in the text.
 * `<text:s text:c="4"/>` means four of them, because XML would collapse the
 * literal characters. Miss it and indented code inside a document loses its
 * shape entirely.
 */
async function readRuns(parent: Element, ctx: Ctx, inherited: Partial<Run> = {}): Promise<Run[]> {
  const out: Run[] = []

  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 3) {
      out.push({ ...inherited, text: node.nodeValue ?? '' })
      continue
    }
    if (node.nodeType !== 1) continue
    const el = node as Element
    if (el.namespaceURI !== TEXT) continue

    switch (el.localName) {
      case 'span':
        out.push(...(await readRuns(el, ctx, { ...inherited, ...spanFormat(el) })))
        break
      case 'a': {
        const href = attr(el, XLINK, 'href') ?? undefined
        // Same rule as DOCX: only a link that leaves the document survives.
        const external = href && !href.startsWith('#') ? href : undefined
        out.push(...(await readRuns(el, ctx, { ...inherited, link: external })))
        break
      }
      case 's': {
        const count = Number(attr(el, TEXT, 'c') ?? '1')
        out.push({ ...inherited, text: ' '.repeat(Number.isFinite(count) ? Math.min(count, 200) : 1) })
        break
      }
      case 'tab':
        out.push({ ...inherited, text: '  ' })
        break
      case 'line-break':
        out.push({ ...inherited, text: '\n' })
        break
      case 'note':
        // Skipped deliberately — see the notice raised in `readOdt`.
        break
      case 'bookmark':
      case 'bookmark-start':
      case 'bookmark-end':
      case 'sequence-decls':
        break
      default:
        out.push(...(await readRuns(el, ctx, inherited)))
        break
    }
  }

  return out
}

/**
 * The formatting a `<text:span>` carries.
 *
 * ODF holds it in an automatic style in the same file, so the span names a
 * style and the style names the weight. `styleFormats` is built once up front
 * because a document of any size names the same handful over and over.
 */
const spanFormats = new WeakMap<Document, Map<string, Partial<Run>>>()

function spanFormat(el: Element): Partial<Run> {
  const name = attr(el, TEXT, 'style-name')
  if (!name) return {}
  return spanFormats.get(el.ownerDocument)?.get(name) ?? {}
}

/**
 * Read both style parts.
 *
 * Two maps in one pass, keyed differently so they can share a return: list
 * style name → is-numbered, and (in the WeakMap above) text style name → run
 * formatting. Automatic styles live in `content.xml`, named ones in
 * `styles.xml`, and a document uses both.
 */
function readTextStyles(content: Document, stylesXml: string | null): Map<string, boolean> {
  const ordered = new Map<string, boolean>()
  const runs = new Map<string, Partial<Run>>()
  const breaks = new Set<string>()

  const scan = (doc: Document) => {
    for (const style of descendants(doc, TEXT, 'list-style')) {
      const name = attr(style, STYLE, 'name')
      if (!name) continue
      // A numbered list declares `<text:list-level-style-number>`; a bulleted
      // one declares `…-bullet`. Level 1 decides for the whole list.
      ordered.set(name, descendant(style, TEXT, 'list-level-style-number') !== null)
    }

    for (const style of descendants(doc, STYLE, 'style')) {
      const name = attr(style, STYLE, 'name')
      if (!name) continue
      if (attr(style, STYLE, 'family') === 'paragraph') {
        const paragraphProps = child(style, STYLE, 'paragraph-properties')
        // 'page' and 'column' are the two values; only 'page' is a page break.
        if (paragraphProps && attr(paragraphProps, FO, 'break-before') === 'page') {
          breaks.add(name)
        }
      }
      if (attr(style, STYLE, 'family') !== 'text') continue
      const props = child(style, STYLE, 'text-properties')
      if (!props) continue
      const format: Partial<Run> = {}
      if ((attr(props, FO, 'font-weight') ?? '') === 'bold') format.bold = true
      if (/italic|oblique/.test(attr(props, FO, 'font-style') ?? '')) format.italic = true
      const underline = attr(props, STYLE, 'text-underline-style') ?? 'none'
      if (underline !== 'none') format.underline = true
      const strike = attr(props, STYLE, 'text-line-through-style') ?? 'none'
      if (strike !== 'none') format.strike = true
      const family = attr(props, STYLE, 'font-name') ?? attr(props, FO, 'font-family') ?? ''
      if (/mono|courier|consolas|menlo/i.test(family)) format.code = true
      if (Object.keys(format).length) runs.set(name, format)
    }
  }

  scan(content)
  // `styles.xml` holds the NAMED styles a document defines; `content.xml` holds
  // the AUTOMATIC ones LibreOffice generates per paragraph. A file uses both,
  // and a page break almost always lands on an automatic style — so scanning
  // only the named part finds nothing.
  if (stylesXml) scan(parseXml(stylesXml, 'styles'))

  // Both parts feed the same maps, keyed off `content`'s document, because that
  // is the one every element the readers touch actually belongs to.
  spanFormats.set(content, runs)
  pageBreakStyles.set(content, breaks)
  return ordered
}

async function readTable(el: Element, ctx: Ctx): Promise<Block> {
  const rows: Run[][][] = []
  // `table:table-header-rows` wraps the header when there is one; its rows are
  // ordinary `table-row`s one level down, so both are collected.
  const rowElements = [
    ...descendants(el, TABLE, 'table-row'),
  ]
  const headerRows = new Set(
    children(el, TABLE, 'table-header-rows').flatMap((h) => descendants(h, TABLE, 'table-row')),
  )

  let headerCount = 0
  for (const tr of rowElements) {
    const cells: Run[][] = []
    for (const tc of children(tr, TABLE, 'table-cell')) {
      const runs: Run[] = []
      for (const p of [...children(tc, TEXT, 'p'), ...children(tc, TEXT, 'h')]) {
        if (runs.length) runs.push({ text: '\n' })
        runs.push(...(await readRuns(p, ctx)))
      }
      // A repeated cell is how ODF stores a run of identical ones — usually the
      // empty tail of a row. Expanded, but capped: a spreadsheet-shaped ODT can
      // claim 16,384 repeats of one blank cell, and honouring that literally
      // builds a table nothing can lay out.
      const repeat = Math.min(Number(attr(tc, TABLE, 'number-columns-repeated') ?? '1') || 1, 64)
      for (let i = 0; i < repeat; i += 1) cells.push(mergeRuns(runs))
    }
    if (cells.length) {
      rows.push(cells)
      if (headerRows.has(tr)) headerCount += 1
    }
  }

  if (!rows.length) return { kind: 'paragraph', runs: [{ text: ' ' }] }
  const useHeader = headerCount > 0 || rows.length > 1
  return {
    kind: 'table',
    header: useHeader ? rows[0] : null,
    rows: useHeader ? rows.slice(1) : rows,
  }
}

async function readImages(el: Element, ctx: Ctx): Promise<Block[]> {
  const out: Block[] = []
  for (const image of descendants(el, DRAW, 'image')) {
    const href = attr(image, XLINK, 'href')
    if (!href || href.startsWith('http')) continue
    const path = href.replace(/^\.\//, '')
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    const blob = await ctx.zip.blobOf(path, IMAGE_MIME[ext] ?? 'application/octet-stream')
    if (blob) {
      const frame = image.parentElement
      const alt = frame ? descendant(frame, SVG_NS, 'title')?.textContent ?? '' : ''
      out.push({ kind: 'image', file: blob, alt })
    }
  }
  return out
}

const SVG_NS = 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0'

async function readMeta(zip: ZipArchive, doc: RichDoc): Promise<void> {
  const xml = await zip.textOf('meta.xml')
  if (!xml) return
  const meta = parseXml(xml, 'metadata')
  doc.title = descendant(meta, DC, 'title')?.textContent?.trim() || undefined
  doc.author =
    descendant(meta, META, 'initial-creator')?.textContent?.trim() ||
    descendant(meta, DC, 'creator')?.textContent?.trim() ||
    undefined
}
