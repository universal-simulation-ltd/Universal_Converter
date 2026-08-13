// ---------------------------------------------------------------------------
// RichDoc → PDF. The layout engine.
//
// ⚠️ THIS IS A PORT. The tokenise → wrap → paginate machinery, the block
// renderers, the quote bar that survives a page break, the table column
// algorithm and the code-block chunking are all Universal PDF's
// `src/lib/markdownToPdf.ts`, moved onto `pdfcore.ts`'s primitives instead of
// pdf-lib's. Kept structurally recognisable ON PURPOSE — same function names,
// same order, same constants where they still apply — so a fix in either app is
// findable in the other. The two are not yet ONE engine in the SDK; that is in
// the backlog, and this comment is the reason it is worth doing.
//
// WHAT CHANGED IN THE PORT, AND WHY
// ---------------------------------
//   * `font.widthOfTextAtSize()` → `widthOfText(fontId, …)`, off the AFM tables
//     in `metrics.ts`. Same numbers; pdf-lib reads them from the same source.
//   * Universal PDF renders MARKDOWN, so its parser and renderer are one file.
//     Here nine formats share this, so it renders the RichDoc model and every
//     parser lives elsewhere.
//   * SMART QUOTES AND DASHES SURVIVE. Universal PDF flattens '’' to "'" and
//     '—' to '-' because pdf-lib's standard fonts throw on anything outside
//     what it will encode. WinAnsi HAS those glyphs, and `pdfcore` encodes
//     them, so a converted Word document keeps its typography.
//   * Hard line breaks inside a paragraph (`\n` in a run — a Word `<w:br/>`)
//     are a token the wrapper honours. Markdown has no such thing.
//   * Images, page breaks and a heading level 4, none of which markdown blocks
//     produced.
// ---------------------------------------------------------------------------

import { PdfDocument, type PdfImage, type PdfPage, rgb, widthOfText, type FontId, type Rgb } from '../../pdfcore'
import { MONO, SANS, SERIF, type FontFamily } from '../metrics'
import { imageToJpeg } from '../../pdf'
import type { Block, RichDoc, Run } from '../model'
// Settings live next door and not here — see the header of `pdfSettings.ts`
// for why splitting them is what keeps this module out of the main bundle.
import type { PageMargin, PaperSize, PdfSettings } from './pdfSettings'

// ── Palette ──────────────────────────────────────────────────────────────────
// The suite's own, matching Universal PDF's markdown export so two documents
// converted by two apps in the suite do not look like they came from different
// companies.
const ORANGE = rgb(0.92, 0.34, 0.06)
const SLATE_900 = rgb(0.06, 0.09, 0.16)
const SLATE_700 = rgb(0.2, 0.25, 0.33)
const SLATE_600 = rgb(0.34, 0.39, 0.46)
const SLATE_400 = rgb(0.58, 0.64, 0.72)
const SLATE_300 = rgb(0.79, 0.82, 0.86)
const SLATE_200 = rgb(0.89, 0.91, 0.93)
const SLATE_50 = rgb(0.97, 0.98, 0.98)
const CODE_BG = rgb(0.97, 0.98, 1.0)
const CODE_BORDER = rgb(0.89, 0.92, 0.96)
const CODE_FG = rgb(0.78, 0.16, 0.32)
const LINK = rgb(0.15, 0.39, 0.92)

// ── Layout constants ─────────────────────────────────────────────────────────
const BASE_LINE = 1.45
const PARA_GAP = 8
const LIST_GAP = 4
const CODE_BLOCK_LINE = 1.4
const TABLE_PAD_X = 8
const TABLE_PAD_Y = 5
const BULLET_INDENT = 18
const QUOTE_INDENT = 18

/** Heading sizes as a multiple of the body size, so one setting scales all. */
const HEADING = {
  1: { scale: 2.18, top: 18, bottom: 4, rule: true },
  2: { scale: 1.55, top: 16, bottom: 4, rule: false },
  3: { scale: 1.18, top: 12, bottom: 2, rule: false },
  4: { scale: 1.0, top: 10, bottom: 2, rule: false },
} as const

/** Points, at 72 per inch. A4 is 210×297mm; Letter is 8.5×11in. */
const PAPER: Record<PaperSize, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
  A5: [419.53, 595.28],
  A3: [841.89, 1190.55],
}

const MARGINS: Record<PageMargin, { top: number; right: number; bottom: number; left: number }> = {
  narrow: { top: 40, right: 36, bottom: 40, left: 36 },
  normal: { top: 64, right: 56, bottom: 56, left: 56 },
  wide: { top: 86, right: 90, bottom: 76, left: 90 },
}

export interface PdfResult {
  blob: Blob
  pages: number
  /** Characters no base-14 font can spell, for an honest warning. */
  dropped: string[]
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function docToPdf(doc: RichDoc, settings: PdfSettings): Promise<PdfResult> {
  // Images are decoded BEFORE anything is laid out, so the renderer itself
  // stays synchronous. A renderer that awaits mid-paragraph has to make its
  // page cursor re-entrant, and nothing about drawing a picture needs that.
  const images = new Map<Blob, PdfImage | null>()
  for (const block of doc.blocks) {
    if (block.kind !== 'image' || images.has(block.file)) continue
    try {
      // 1600px cap and 0.82: the same bargain the pictures-to-PDF export makes.
      // A photo nobody will print larger than A4 gains nothing from 4000px, and
      // a document full of full-resolution pages is one you cannot email.
      images.set(block.file, await imageToJpeg(block.file, 0.82, 1600))
    } catch {
      // A corrupt or exotic embedded picture must not take the document with
      // it — the page simply carries on without that one.
      images.set(block.file, null)
    }
  }

  const renderer = new Renderer(settings, images)
  for (const block of doc.blocks) renderer.renderBlock(block)
  if (settings.pageNumbers) renderer.drawPageNumbers()

  const blob = renderer.pdf.save({
    title: doc.title,
    author: doc.author,
  })
  return {
    blob,
    pages: renderer.pdf.pageCount,
    dropped: [...renderer.pdf.report.dropped],
  }
}

// ── Tokens ───────────────────────────────────────────────────────────────────

interface Token {
  run: Run
  text: string
  width: number
  isSpace: boolean
  /** A hard line break — a `\n` inside a run, not a wrap point. */
  isBreak: boolean
  size: number
  font: FontId
}

class Renderer {
  pdf = new PdfDocument()
  page!: PdfPage
  pageWidth = 0
  pageHeight = 0
  y = 0
  pages: PdfPage[] = []

  private settings: PdfSettings
  private body: FontFamily
  private margin: typeof MARGINS[PageMargin]
  private images: Map<Blob, PdfImage | null>

  constructor(settings: PdfSettings, images: Map<Blob, PdfImage | null>) {
    this.settings = settings
    this.body = settings.font === 'serif' ? SERIF : SANS
    this.margin = MARGINS[settings.margin]
    this.images = images
    this.newPage()
  }

  get base(): number {
    return this.settings.fontSize
  }

  get contentWidth(): number {
    return this.pageWidth - this.margin.left - this.margin.right
  }

  newPage(): void {
    const [width, height] = PAPER[this.settings.paper]
    this.page = this.pdf.addPage(width, height)
    this.pages.push(this.page)
    this.pageWidth = width
    this.pageHeight = height
    this.y = height - this.margin.top
  }

  /** Start a new page if `needed` points won't fit below the cursor. */
  ensure(needed: number): void {
    if (this.y - needed < this.margin.bottom) this.newPage()
  }

  fontForRun(run: Run): FontId {
    const family = run.code ? MONO : this.body
    if (run.bold && run.italic) return family.boldItalic
    if (run.bold) return family.bold
    if (run.italic) return family.italic
    return family.regular
  }

  tokenize(runs: readonly Run[], baseSize: number): Token[] {
    const out: Token[] = []
    for (const run of runs) {
      const font = this.fontForRun(run)
      // Monospaced glyphs are wider per character, so inline code set at the
      // body size looks a size too big beside it.
      const size = run.code ? baseSize * 0.92 : baseSize
      // The capture groups keep the separators, so spacing survives the split
      // and a `\n` arrives as its own token rather than as whitespace.
      for (const part of run.text.split(/(\n)|([ \t]+)/).filter((p) => p)) {
        if (part === '\n') {
          out.push({ run, text: '', width: 0, isSpace: false, isBreak: true, size, font })
          continue
        }
        out.push({
          run,
          text: part,
          width: widthOfText(font, part, size),
          isSpace: /^[ \t]+$/.test(part),
          isBreak: false,
          size,
          font,
        })
      }
    }
    return out
  }

  /**
   * Break a token too wide for the column.
   *
   * A URL or a German compound noun has no space in it, and without this the
   * wrapper puts it on a line of its own and lets it run off the page.
   */
  hardBreak(token: Token, maxWidth: number): Token[] {
    if (token.width <= maxWidth || token.isSpace || token.isBreak) return [token]
    const out: Token[] = []
    let rest = token.text
    while (rest.length) {
      let n = 1
      while (n < rest.length && widthOfText(token.font, rest.slice(0, n + 1), token.size) <= maxWidth) n += 1
      const head = rest.slice(0, n)
      out.push({ ...token, text: head, width: widthOfText(token.font, head, token.size) })
      rest = rest.slice(n)
    }
    return out
  }

  wrap(tokens: readonly Token[], maxWidth: number): Token[][] {
    const broken: Token[] = []
    for (const token of tokens) broken.push(...this.hardBreak(token, maxWidth))

    const lines: Token[][] = []
    let line: Token[] = []
    let width = 0

    const endLine = () => {
      // Trailing spaces would push the last word off a justified edge and show
      // as a gap on a centred one.
      while (line.length && line[line.length - 1].isSpace) {
        width -= line.pop()!.width
      }
      lines.push(line)
      line = []
      width = 0
    }

    for (const token of broken) {
      if (token.isBreak) { endLine(); continue }
      if (width + token.width > maxWidth && line.length > 0) {
        endLine()
        // A space that fell at the wrap point is consumed by the wrap.
        if (token.isSpace) continue
      }
      line.push(token)
      width += token.width
    }
    if (line.length) lines.push(line)
    return lines
  }

  drawTokens(tokens: readonly Token[], baseline: number, x: number, color: Rgb): void {
    // Plates first, in their own pass: drawn inline they would paint over the
    // preceding token's glyphs, because a plate is wider than its text.
    let cursor = x
    for (const token of tokens) {
      if (token.run.code && !token.isSpace) {
        this.page.drawRect({
          x: cursor - 1,
          y: baseline - 2,
          width: token.width + 2,
          height: token.size + 4,
          color: CODE_BG,
          borderColor: CODE_BORDER,
          borderWidth: 0.5,
        })
      }
      cursor += token.width
    }

    cursor = x
    for (const token of tokens) {
      const colour = token.run.code ? CODE_FG : token.run.link ? LINK : color
      this.page.drawText(token.text, { x: cursor, y: baseline, size: token.size, font: token.font, color: colour })

      if (!token.isSpace && (token.run.link || token.run.underline)) {
        this.page.drawRect({
          x: cursor,
          y: baseline - 1.5,
          width: token.width,
          height: 0.5,
          color: token.run.link ? LINK : colour,
        })
      }
      if (!token.isSpace && token.run.strike) {
        this.page.drawRect({
          x: cursor,
          y: baseline + token.size * 0.28,
          width: token.width,
          height: 0.5,
          color: colour,
        })
      }
      if (token.run.link && !token.isSpace) {
        this.page.addLink(cursor, baseline - 2, cursor + token.width, baseline + token.size, token.run.link)
      }
      cursor += token.width
    }
  }

  drawRuns(
    runs: readonly Run[],
    size: number,
    color: Rgb,
    x = this.margin.left,
    maxWidth = this.contentWidth,
    lineHeightMul = BASE_LINE,
  ): void {
    const lines = this.wrap(this.tokenize(runs, size), maxWidth)
    const lineHeight = size * lineHeightMul
    for (const line of lines) {
      this.ensure(lineHeight)
      this.y -= lineHeight
      this.drawTokens(line, this.y + (lineHeight - size) * 0.25, x, color)
    }
  }

  // ── Blocks ─────────────────────────────────────────────────────────────────

  renderBlock(block: Block): void {
    switch (block.kind) {
      case 'heading':
        this.renderHeading(block.runs, block.level)
        break
      case 'paragraph':
        this.y -= PARA_GAP
        this.drawRuns(block.runs, this.base, SLATE_700)
        break
      case 'list':
        this.renderList(block.items, block.ordered)
        break
      case 'quote':
        this.renderQuote(block.runs)
        break
      case 'code':
        this.renderCodeBlock(block.text)
        break
      case 'rule':
        this.renderRule()
        break
      case 'table':
        this.renderTable(block.header, block.rows)
        break
      case 'image':
        this.renderImage(block.file)
        break
      case 'pagebreak':
        // Only if the page has something on it — otherwise a break at the top
        // of a fresh page emits a blank one.
        if (this.y < this.pageHeight - this.margin.top) this.newPage()
        break
    }
  }

  renderHeading(runs: readonly Run[], level: 1 | 2 | 3 | 4): void {
    const spec = HEADING[level]
    const size = this.base * spec.scale
    this.y -= spec.top
    // A heading alone at the foot of a page is an orphan: this reserves the
    // heading plus two body lines, so it moves down with the text it titles.
    this.ensure(size * 1.2 + this.base * BASE_LINE * 2)
    this.drawRuns(runs, size, SLATE_900, this.margin.left, this.contentWidth, 1.2)

    if (spec.rule) {
      this.y -= 4
      this.ensure(3)
      this.page.drawRect({ x: this.margin.left, y: this.y, width: 36, height: 2.5, color: ORANGE })
      this.page.drawRect({
        x: this.margin.left + 36,
        y: this.y + 0.75,
        width: this.contentWidth - 36,
        height: 1,
        color: SLATE_200,
      })
      this.y -= 3
    }
    this.y -= spec.bottom
  }

  renderList(items: readonly { runs: Run[]; level: number }[], ordered: boolean): void {
    this.y -= PARA_GAP
    const lineHeight = this.base * BASE_LINE
    // Numbering restarts per level, so a nested list counts 1, 2, 3 of its own
    // rather than continuing its parent's run.
    const counters = [0, 0, 0, 0, 0]

    items.forEach((item, index) => {
      const level = Math.min(4, Math.max(0, item.level))
      counters[level] += 1
      for (let deeper = level + 1; deeper < counters.length; deeper += 1) counters[deeper] = 0

      const indent = BULLET_INDENT * (level + 1)
      const x = this.margin.left + indent
      const maxWidth = this.contentWidth - indent
      const lines = this.wrap(this.tokenize(item.runs, this.base), maxWidth)

      lines.forEach((line, lineIndex) => {
        this.ensure(lineHeight)
        this.y -= lineHeight
        const baseline = this.y + (lineHeight - this.base) * 0.25
        if (lineIndex === 0) {
          // ⚠️ EVERY MARKER HERE MUST BE WINANSI. Bullets alternate by depth so
          // a nested list reads without relying on indentation alone — but the
          // obvious set (•, ◦, ▪) is two-thirds unwritable by a base-14 font,
          // and the renderer emitting characters it cannot draw put a "some
          // characters came out as ?" warning on every nested list in the app.
          // These three are Word's own defaults and all three are in WinAnsi.
          const marker = ordered
            ? `${counters[level]}.`
            : level === 0 ? '•' : level === 1 ? 'o' : '-'
          this.page.drawText(marker, {
            x: this.margin.left + indent - BULLET_INDENT + (ordered ? 0 : 3),
            y: baseline,
            size: this.base,
            font: ordered ? this.body.bold : this.body.regular,
            color: ordered ? SLATE_600 : ORANGE,
          })
        }
        this.drawTokens(line, baseline, x, SLATE_700)
      })

      if (index < items.length - 1) this.y -= LIST_GAP
    })
  }

  /**
   * A quote with a bar down its left edge.
   *
   * The bar cannot be one rectangle: a quote that spans a page break needs one
   * bar per page, each drawn when that page's last line is placed. Hence the
   * segment bookkeeping — drawing it up front would put the whole bar on page
   * one, running off the bottom.
   */
  renderQuote(runs: readonly Run[]): void {
    this.y -= PARA_GAP
    const x = this.margin.left + QUOTE_INDENT
    const maxWidth = this.contentWidth - QUOTE_INDENT
    const lines = this.wrap(this.tokenize(runs, this.base), maxWidth)
    if (!lines.length) return

    const lineHeight = this.base * BASE_LINE
    let segmentPage = this.page
    let segmentTop = this.y

    const drawBar = (bottom: number) => {
      if (segmentTop - bottom <= 0) return
      segmentPage.drawRect({
        x: this.margin.left,
        y: bottom - 2,
        width: 3,
        height: segmentTop - bottom + 4,
        color: ORANGE,
      })
    }

    for (const line of lines) {
      if (this.y - lineHeight < this.margin.bottom) {
        drawBar(this.y)
        this.newPage()
        segmentPage = this.page
        segmentTop = this.y
      }
      this.y -= lineHeight
      this.drawTokens(line, this.y + (lineHeight - this.base) * 0.25, x, SLATE_600)
    }
    drawBar(this.y)
  }

  /**
   * A code block on a tinted plate.
   *
   * Chunked rather than drawn line by line because the plate is one rectangle
   * per page: the loop works out how many lines fit below the cursor, draws a
   * plate exactly that tall, fills it, and carries the rest onto the next page.
   */
  renderCodeBlock(text: string): void {
    this.y -= PARA_GAP
    const size = this.base * 0.86
    const font = MONO.regular
    const pad = 10
    const maxWidth = this.contentWidth - 2 * pad

    const wrapped: string[] = []
    for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
      let rest = raw.replace(/\t/g, '    ')
      if (widthOfText(font, rest, size) <= maxWidth) {
        wrapped.push(rest)
        continue
      }
      while (rest.length) {
        let n = 1
        while (n < rest.length && widthOfText(font, rest.slice(0, n + 1), size) <= maxWidth) n += 1
        wrapped.push(rest.slice(0, n))
        rest = rest.slice(n)
        // A continuation is indented so a wrapped line reads as one, not two.
        if (rest.length) rest = '  ' + rest
      }
    }

    const lineHeight = size * CODE_BLOCK_LINE
    let index = 0
    while (index < wrapped.length) {
      const room = this.y - this.margin.bottom - 2 * pad
      const fits = Math.max(1, Math.floor(room / lineHeight))
      const take = Math.min(fits, wrapped.length - index)
      const height = take * lineHeight + 2 * pad
      if (this.y - height < this.margin.bottom) {
        this.newPage()
        continue
      }

      this.page.drawRect({
        x: this.margin.left,
        y: this.y - height,
        width: this.contentWidth,
        height,
        color: CODE_BG,
        borderColor: CODE_BORDER,
        borderWidth: 0.5,
      })

      let cursor = this.y - pad
      for (let i = 0; i < take; i += 1) {
        cursor -= lineHeight
        this.page.drawText(wrapped[index + i], {
          x: this.margin.left + pad,
          y: cursor + lineHeight * 0.2,
          size,
          font,
          color: SLATE_900,
        })
      }
      this.y -= height
      index += take
    }
  }

  renderRule(): void {
    this.y -= PARA_GAP
    this.ensure(8)
    this.y -= 6
    this.page.drawRect({ x: this.margin.left, y: this.y, width: this.contentWidth, height: 0.6, color: SLATE_200 })
    this.y -= 4
  }

  /**
   * A picture, scaled to fit the column and never enlarged.
   *
   * A picture taller than the page is scaled to fit the page rather than being
   * clipped by it — losing the bottom half of a diagram silently is the worst
   * of the available failures.
   */
  renderImage(file: Blob): void {
    const image = this.images.get(file)
    if (!image) return

    this.y -= PARA_GAP
    const maxWidth = this.contentWidth
    const maxHeight = this.pageHeight - this.margin.top - this.margin.bottom
    const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height)
    const width = image.width * scale
    const height = image.height * scale

    this.ensure(height)
    this.y -= height
    this.page.drawImage(image, {
      x: this.margin.left + (this.contentWidth - width) / 2,
      y: this.y,
      width,
      height,
    })
    this.y -= 4
  }

  /**
   * A table.
   *
   * Column widths come from two measurements per column: its NATURAL width (the
   * cell laid out on one line) and its MINIMUM (the widest single word, which
   * is as narrow as it can be without breaking a word mid-way). If the naturals
   * fit, they are used and the slack is shared; if not, they are scaled down
   * but never below the minimum, so no column collapses to nothing.
   */
  renderTable(header: Run[][] | null, rows: readonly Run[][][]): void {
    this.y -= PARA_GAP
    const size = this.base * 0.9
    const all = header ? [header, ...rows] : [...rows]
    const columns = Math.max(1, ...all.map((r) => r.length))
    if (!all.length) return

    const naturals = new Array<number>(columns).fill(0)
    const minimums = new Array<number>(columns).fill(0)
    for (const row of all) {
      for (let c = 0; c < columns; c += 1) {
        const tokens = this.tokenize(row[c] ?? [], size)
        let natural = 0
        let widest = 0
        for (const token of tokens) {
          natural += token.width
          if (!token.isSpace) widest = Math.max(widest, token.width)
        }
        naturals[c] = Math.max(naturals[c], natural)
        minimums[c] = Math.max(minimums[c], widest)
      }
    }

    const padding = TABLE_PAD_X * 2 * columns
    const inner = this.contentWidth - padding
    const totalNatural = naturals.reduce((a, b) => a + b, 0)
    let widths: number[]

    if (totalNatural <= inner) {
      widths = naturals.map((n) => n + TABLE_PAD_X * 2)
      const slack = this.contentWidth - widths.reduce((a, b) => a + b, 0)
      if (slack > 0) widths = widths.map((w) => w + slack / columns)
    } else {
      const scale = inner / totalNatural
      widths = naturals.map((n, c) => Math.max(minimums[c], n * scale) + TABLE_PAD_X * 2)
      const total = widths.reduce((a, b) => a + b, 0)
      if (total > this.contentWidth) {
        const k = this.contentWidth / total
        widths = widths.map((w) => w * k)
      }
    }

    const renderRow = (row: readonly Run[][], isHeader: boolean) => {
      const cellLines: Token[][][] = []
      for (let c = 0; c < columns; c += 1) {
        const cell = (row[c] ?? []).map((r) => (isHeader ? { ...r, bold: true } : r))
        const lines = this.wrap(this.tokenize(cell, size), widths[c] - TABLE_PAD_X * 2)
        cellLines.push(lines.length ? lines : [[]])
      }
      const lineCount = Math.max(1, ...cellLines.map((l) => l.length))
      const lineHeight = size * 1.4
      const height = lineCount * lineHeight + TABLE_PAD_Y * 2
      this.ensure(height)

      if (isHeader) {
        this.page.drawRect({
          x: this.margin.left,
          y: this.y - height,
          width: this.contentWidth,
          height,
          color: SLATE_50,
        })
      }

      let x = this.margin.left
      for (let c = 0; c < columns; c += 1) {
        let baseline = this.y - TABLE_PAD_Y
        for (const line of cellLines[c]) {
          baseline -= lineHeight
          this.drawTokens(line, baseline + lineHeight * 0.2, x + TABLE_PAD_X, isHeader ? SLATE_900 : SLATE_700)
        }
        x += widths[c]
      }

      this.page.drawRect({
        x: this.margin.left,
        y: this.y - height,
        width: this.contentWidth,
        height: 0.5,
        color: SLATE_200,
      })
      this.y -= height
    }

    this.ensure(0.5)
    this.page.drawRect({ x: this.margin.left, y: this.y, width: this.contentWidth, height: 0.5, color: SLATE_300 })
    if (header) renderRow(header, true)
    for (const row of rows) renderRow(row, false)
  }

  /** Page numbers, drawn last because "of N" is not knowable until then. */
  drawPageNumbers(): void {
    const total = this.pages.length
    if (total < 2) return
    for (let i = 0; i < total; i += 1) {
      const label = `${i + 1} / ${total}`
      const width = widthOfText(this.body.regular, label, 9)
      this.pages[i].drawText(label, {
        x: this.pageWidth - this.margin.right - width,
        y: Math.max(24, this.margin.bottom - 26),
        size: 9,
        font: this.body.regular,
        color: SLATE_400,
      })
    }
  }
}
