// ---------------------------------------------------------------------------
// HTML → RichDoc.
//
// The browser is already the best HTML parser in the room, so this does not
// write one: `DOMParser` with 'text/html' builds the tree, and this walks it.
//
// ⚠️ `DOMParser` DOES NOT RUN SCRIPTS AND DOES NOT FETCH ANYTHING. The document
// it returns is inert — `<script>` is parsed as an element and never executed,
// `<img>` never issues a request, and nothing is attached to this page. That is
// what makes it safe to point at a file somebody was emailed, and it is the
// reason this is a parse rather than an iframe. `innerHTML` on a live element
// would be a different and much worse decision.
//
// The walk is deliberately shallow on layout: a `<div>` is a paragraph if it
// holds text, tables come through as tables, and everything positional —
// floats, columns, absolute placement, CSS of any kind — is ignored. The output
// is a flowed document, so honouring a two-column layout would mean interleaving
// the columns line by line, which is worse than not honouring it.
// ---------------------------------------------------------------------------

import {
  addNotice, mergeRuns, tidy,
  type Block, type ListItem, type RichDoc, type Run,
} from '../model'

/** Elements whose content is not document text. */
const IGNORED = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'TITLE',
  'NAV', 'SVG', 'CANVAS', 'IFRAME', 'AUDIO', 'VIDEO', 'OBJECT', 'EMBED',
  'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'DIALOG',
])

const BLOCKISH = new Set([
  'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'HEADER', 'FOOTER', 'FIGURE',
  'FIGCAPTION', 'ADDRESS', 'DETAILS', 'SUMMARY', 'FIELDSET', 'BODY', 'DD', 'DT', 'DL',
])

export async function readHtml(file: File): Promise<RichDoc> {
  return parseHtmlDoc(await file.text(), file.name)
}

export function parseHtmlDoc(source: string, filename?: string): RichDoc {
  const parsed = new DOMParser().parseFromString(source, 'text/html')
  const doc: RichDoc = { blocks: [], notices: [] }

  const body = parsed.body
  if (!body) throw new Error('This HTML file has no body to read.')

  walk(body, doc, doc.blocks, {})

  if (parsed.querySelector('img[src]')) {
    // A page's pictures are separate files it points AT. The drop had one file
    // in it, so there is nothing to embed — said plainly, because a converted
    // page with its images missing otherwise looks like a bug.
    addNotice(doc, 'Pictures were left out — an HTML page links to its images rather than containing them, and only this file was dropped.')
  }
  if (parsed.querySelector('[style], style')) {
    addNotice(doc, 'Styling was ignored — colours, fonts and layout come out as this converter’s own.', 'info')
  }

  doc.title = parsed.title?.trim() || filename?.replace(/\.x?html?$/i, '')
  if (!doc.blocks.length) throw new Error('No readable text was found in this HTML.')
  return tidy(doc)
}

function walk(node: Element, doc: RichDoc, out: Block[], inherited: Partial<Run>): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      // Loose text directly under a block element — common in hand-written
      // HTML, where a paragraph is not always wrapped in a <p>.
      const text = collapse(child.nodeValue ?? '')
      if (text.trim()) out.push({ kind: 'paragraph', runs: [{ ...inherited, text }] })
      continue
    }
    if (child.nodeType !== 1) continue

    const el = child as HTMLElement
    const tag = el.tagName.toUpperCase()
    if (IGNORED.has(tag)) continue

    switch (tag) {
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': {
        const level = Math.min(4, Number(tag[1])) as 1 | 2 | 3 | 4
        out.push({ kind: 'heading', level, runs: mergeRuns(inline(el, inherited)) })
        break
      }

      case 'P':
        out.push({ kind: 'paragraph', runs: mergeRuns(inline(el, inherited)) })
        break

      case 'BLOCKQUOTE':
        out.push({ kind: 'quote', runs: mergeRuns(inline(el, inherited)) })
        break

      case 'PRE':
        // `textContent`, not the inline walk: whitespace IS the content here,
        // and the walk collapses it.
        out.push({ kind: 'code', text: (el.textContent ?? '').replace(/\n+$/, '') })
        break

      case 'HR':
        out.push({ kind: 'rule' })
        break

      case 'UL': case 'OL': {
        const items: ListItem[] = []
        collectListItems(el, items, 0, inherited)
        if (items.length) out.push({ kind: 'list', ordered: tag === 'OL', items })
        break
      }

      case 'TABLE':
        out.push(readTable(el, inherited))
        break

      case 'BR':
        break

      default:
        if (BLOCKISH.has(tag)) {
          // A container. If it holds any block-level child, recurse; if it is
          // just a wrapper round some text, it IS the paragraph.
          if (el.querySelector('p, div, h1, h2, h3, h4, h5, h6, ul, ol, table, pre, blockquote, section, article')) {
            walk(el, doc, out, inherited)
          } else {
            const runs = mergeRuns(inline(el, inherited))
            if (runs.length) out.push({ kind: 'paragraph', runs })
          }
        } else {
          // An inline element sitting where a block was expected — <span>,
          // <a>, <strong> loose in a body. It is a paragraph's worth of text.
          const runs = mergeRuns(inline(el, inherited))
          if (runs.length) out.push({ kind: 'paragraph', runs })
        }
        break
    }
  }
}

function collectListItems(list: Element, out: ListItem[], level: number, inherited: Partial<Run>): void {
  for (const li of Array.from(list.children)) {
    if (li.tagName.toUpperCase() !== 'LI') continue
    // The item's own text, not its nested list's — so the nested list is taken
    // out of the run walk and recursed into separately, at one level deeper.
    const nested = Array.from(li.children).filter((c) => /^(UL|OL)$/i.test(c.tagName))
    const runs: Run[] = []
    for (const node of Array.from(li.childNodes)) {
      if (node.nodeType === 1 && /^(UL|OL)$/i.test((node as Element).tagName)) continue
      runs.push(...inlineNode(node, inherited))
    }
    const merged = mergeRuns(runs)
    if (merged.length) out.push({ runs: merged, level })
    for (const child of nested) collectListItems(child, out, Math.min(4, level + 1), inherited)
  }
}

function readTable(table: Element, inherited: Partial<Run>): Block {
  const rows: Run[][][] = []
  let headerCount = 0

  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const cells: Run[][] = []
    let allHeaders = true
    for (const cell of Array.from(tr.children)) {
      const tag = cell.tagName.toUpperCase()
      if (tag !== 'TD' && tag !== 'TH') continue
      if (tag !== 'TH') allHeaders = false
      cells.push(mergeRuns(inline(cell, inherited)))
    }
    if (!cells.length) continue
    if (allHeaders && rows.length === headerCount) headerCount += 1
    rows.push(cells)
  }

  if (!rows.length) return { kind: 'paragraph', runs: [{ text: ' ' }] }
  const useHeader = headerCount > 0 || rows.length > 1
  return {
    kind: 'table',
    header: useHeader ? rows[0] : null,
    rows: useHeader ? rows.slice(1) : rows,
  }
}

/** Inline content of an element, flattened to runs. */
function inline(el: Element, inherited: Partial<Run>): Run[] {
  const out: Run[] = []
  for (const node of Array.from(el.childNodes)) out.push(...inlineNode(node, inherited))
  return out
}

function inlineNode(node: ChildNode, inherited: Partial<Run>): Run[] {
  if (node.nodeType === 3) {
    return [{ ...inherited, text: collapse(node.nodeValue ?? '') }]
  }
  if (node.nodeType !== 1) return []

  const el = node as HTMLElement
  const tag = el.tagName.toUpperCase()
  if (IGNORED.has(tag)) return []
  if (tag === 'BR') return [{ ...inherited, text: '\n' }]
  if (tag === 'IMG') {
    const alt = el.getAttribute('alt')?.trim()
    return alt ? [{ ...inherited, text: `[${alt}]`, italic: true }] : []
  }

  const style: Partial<Run> = { ...inherited }
  if (tag === 'B' || tag === 'STRONG') style.bold = true
  if (tag === 'I' || tag === 'EM' || tag === 'CITE' || tag === 'VAR') style.italic = true
  if (tag === 'U' || tag === 'INS') style.underline = true
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') style.strike = true
  if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT') style.code = true
  if (tag === 'A') {
    const href = el.getAttribute('href')?.trim()
    // Only absolute http(s) survives. A relative path or an in-page anchor
    // points somewhere the PDF is not, so it would be a hotspot to nowhere.
    if (href && /^https?:\/\//i.test(href)) style.link = href
  }

  const out: Run[] = []
  for (const child of Array.from(el.childNodes)) out.push(...inlineNode(child, style))
  // A block element nested inside an inline walk (a <div> inside a <td>) needs
  // its own line, or two paragraphs run together into one sentence.
  if (BLOCKISH.has(tag) || tag === 'P') out.push({ ...inherited, text: '\n' })
  return out
}

/** HTML collapses runs of whitespace to one space; so does this. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ')
}
