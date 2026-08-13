// ---------------------------------------------------------------------------
// RichDoc — the shape every document passes through.
//
// WHY A MODEL AND NOT A PILE OF CONVERTERS
// ----------------------------------------
// The Files tab reads nine kinds of input and writes six kinds of output. Wired
// directly that is fifty-odd conversions; through one model it is nine readers
// and six writers, and adding a tenth input costs one file rather than six.
//
// The model is deliberately SMALL — headings, paragraphs, lists, tables, code,
// rules, images — because it is the intersection of what every format here can
// express, not the union. A DOCX can hold a text box rotated 3° over a chart;
// Markdown cannot, plain text cannot, and pretending otherwise means every
// writer grows a branch for something only one reader ever emits. Anything
// outside this vocabulary is flattened on the way IN, by the reader that knows
// what it meant, and the loss is reported (`DocNotice`) rather than discovered.
// ---------------------------------------------------------------------------

/** A stretch of text with its formatting. The atom of the model. */
export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  /** Rendered in a monospaced face on a tinted plate. */
  code?: boolean
  /** Underline is kept because Word documents genuinely use it for emphasis. */
  underline?: boolean
  strike?: boolean
  /** An absolute URL. Becomes a real clickable annotation in the PDF. */
  link?: string
}

export interface ListItem {
  runs: Run[]
  /** 0 for a top-level bullet; each nested level indents once more. */
  level: number
}

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; runs: Run[] }
  | { kind: 'paragraph'; runs: Run[] }
  | { kind: 'list'; ordered: boolean; items: ListItem[] }
  | { kind: 'quote'; runs: Run[] }
  | { kind: 'code'; text: string }
  | { kind: 'rule' }
  | { kind: 'table'; header: Run[][] | null; rows: Run[][][] }
  | { kind: 'image'; file: Blob; alt: string }
  | { kind: 'pagebreak' }

/**
 * Something the reader had to give up, or thinks you should know.
 *
 * Carried on the document rather than thrown, because these are not failures:
 * a .doc that arrives as text is still a useful PDF, and the right move is to
 * hand it over WITH the sentence attached, not to refuse it. The UI shows them
 * on the finished row.
 */
export interface DocNotice {
  /** One sentence, written for somebody who has never heard of a piece table. */
  message: string
  /** 'loss' is something the file had and the result does not. */
  severity: 'loss' | 'info'
}

export interface RichDoc {
  blocks: Block[]
  /** From the file's own metadata where it has any; falls back to the filename. */
  title?: string
  author?: string
  notices: DocNotice[]
}

export function emptyDoc(): RichDoc {
  return { blocks: [], notices: [] }
}

/** A plain run of text, used constantly by the readers. */
export function text(value: string): Run[] {
  return [{ text: value }]
}

/** The plain text of a run list — what every non-PDF writer starts from. */
export function runsToText(runs: readonly Run[]): string {
  return runs.map((r) => r.text).join('')
}

/**
 * Collapse runs that carry identical formatting.
 *
 * Word splits a sentence into a run per spell-check state, per revision, per
 * rsid — a plain paragraph routinely arrives as thirty runs. Left alone, that
 * is thirty `Tj` operators in the PDF and thirty `<span>`s in the HTML, and the
 * line-breaker cannot kern across the joins either. This is the one bit of
 * tidying every reader wants, so it lives here.
 */
export function mergeRuns(runs: readonly Run[]): Run[] {
  const out: Run[] = []
  for (const run of runs) {
    if (!run.text) continue
    const last = out[out.length - 1]
    if (last && sameFormat(last, run)) last.text += run.text
    else out.push({ ...run })
  }
  return out
}

function sameFormat(a: Run, b: Run): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.code === !!b.code &&
    !!a.underline === !!b.underline &&
    !!a.strike === !!b.strike &&
    a.link === b.link
  )
}

/**
 * Drop empty paragraphs and merge every block's runs.
 *
 * A blank paragraph is how a Word user makes a gap, so ONE is kept as a
 * paragraph with a single space — the writers turn that into a normal
 * paragraph gap. Runs of them (a page's worth of Enter to push a heading down)
 * collapse, because the PDF paginates on its own and reproducing somebody's
 * manual pagination inside a different page size produces holes.
 */
export function tidy(doc: RichDoc): RichDoc {
  const blocks: Block[] = []
  let blankRun = 0

  for (const block of doc.blocks) {
    if ('runs' in block) {
      const merged = mergeRuns(block.runs)
      const isBlank = merged.every((r) => !r.text.trim())
      if (isBlank && block.kind === 'paragraph') {
        blankRun += 1
        if (blankRun === 1) blocks.push({ kind: 'paragraph', runs: [{ text: ' ' }] })
        continue
      }
      if (isBlank) continue
      blankRun = 0
      blocks.push({ ...block, runs: merged } as Block)
      continue
    }

    blankRun = 0
    if (block.kind === 'list') {
      const items = block.items
        .map((i) => ({ ...i, runs: mergeRuns(i.runs) }))
        .filter((i) => runsToText(i.runs).trim())
      if (items.length) blocks.push({ ...block, items })
      continue
    }
    if (block.kind === 'table') {
      blocks.push({
        ...block,
        header: block.header ? block.header.map(mergeRuns) : null,
        rows: block.rows.map((row) => row.map(mergeRuns)),
      })
      continue
    }
    blocks.push(block)
  }

  // A leading or trailing gap is somebody's cursor, not their intent.
  while (blocks.length && isSpacer(blocks[0])) blocks.shift()
  while (blocks.length && isSpacer(blocks[blocks.length - 1])) blocks.pop()

  return { ...doc, blocks }
}

function isSpacer(block: Block): boolean {
  return block.kind === 'paragraph' && !runsToText(block.runs).trim()
}

export function addNotice(doc: RichDoc, message: string, severity: DocNotice['severity'] = 'loss'): void {
  if (doc.notices.some((n) => n.message === message)) return
  doc.notices.push({ message, severity })
}

// ── Tabular data ─────────────────────────────────────────────────────────────

/**
 * A grid, kept alongside `RichDoc` rather than inside it.
 *
 * CSV → JSON has no business going through a document model: it is rows of
 * strings in and rows of strings out, and routing it through paragraphs and
 * runs would lose the types on the way. Readers that have a genuine grid
 * (`csv`, `json`) expose one as well as a `RichDoc`, and the data writers take
 * the grid while the document writers take the doc.
 */
export interface Grid {
  /** Column names. Empty when the source had no header row. */
  header: string[]
  rows: string[][]
}
