// ---------------------------------------------------------------------------
// The PDF writer — objects, pages, fonts, text, rules and images.
//
// WHY THIS IS STILL HAND-WRITTEN
// ------------------------------
// `pdf.ts` used to end with a note saying that if text was ever wanted, the
// right move was to take a real PDF library rather than grow the writer. The
// Files tab is exactly that moment, and the note was re-read before it was
// overruled. What changed the answer:
//
//   * The expensive half of "documents to PDF" is not the file format, it is
//     the LAYOUT — line breaking, pagination, lists, tables. Universal PDF
//     already has that engine (`src/lib/markdownToPdf.ts`), and only its bottom
//     inch touches pdf-lib: `widthOfTextAtSize`, `drawText`, `drawRectangle`,
//     `drawLine`. Porting it needed those four primitives, not a library.
//   * The base-14 fonts are IN every PDF reader. Using them means no font
//     embedding, no subsetting, no CMap — the genuinely hard parts of a PDF
//     library — in exchange for one table of glyph widths per font (`doc/
//     metrics.ts`).
//   * pdf-lib is ~380 KB gzipped. This app's pitch is that it is small and runs
//     offline from the first visit, and a lazily-fetched library breaks the
//     second half of that: your first document conversion would need the
//     network. LAME and libFLAC are fetched on demand because there is no other
//     way to have MP3 and FLAC at all. There is another way to have text.
//
// WHAT THIS DELIBERATELY DOES NOT DO
// ----------------------------------
//   * No font EMBEDDING, so only what WinAnsi can spell — Latin-1 plus the
//     Windows-1252 extras (smart quotes, dashes, bullet, ellipsis, euro).
//     Cyrillic, Greek, Hebrew, Arabic and CJK cannot be written at all. They
//     are COUNTED and reported (`EncodeReport`) rather than silently replaced,
//     because a document that comes back as ??? with no explanation is worse
//     than one that refuses.
//   * No reading or editing an existing PDF. That needs a parser, which is a
//     different program. Universal PDF is the app for that.
// ---------------------------------------------------------------------------

import { FONT_METRICS, type FontId } from './doc/metrics.ts'

export type { FontId }

export interface Rgb {
  r: number
  g: number
  b: number
}

export function rgb(r: number, g: number, b: number): Rgb {
  return { r, g, b }
}

/** A JPEG ready to be embedded. `/DCTDecode` takes the compressed bytes as-is. */
export interface PdfImage {
  jpeg: Uint8Array
  width: number
  height: number
}

// ── WinAnsi encoding ─────────────────────────────────────────────────────────
// Codes 32–126 and 160–255 are Unicode's own values, so they need no table.
// 128–159 is where Windows-1252 differs from Latin-1, and it is the useful
// part: every smart quote, dash and bullet a word processor emits lives here.
// Universal PDF's markdown writer flattens these to ASCII ('’' → "'") because
// pdf-lib's standard fonts throw on them; we can spell them properly, so a
// converted document keeps its typography instead of losing it on the way out.
const WIN_ANSI_HIGH: Record<string, number> = {
  '€': 0x80, // euro
  '‚': 0x82, // single low quote
  'ƒ': 0x83, // florin
  '„': 0x84, // double low quote
  '…': 0x85, // ellipsis
  '†': 0x86, // dagger
  '‡': 0x87, // double dagger
  'ˆ': 0x88, // circumflex
  '‰': 0x89, // per mille
  'Š': 0x8a, // S caron
  '‹': 0x8b, // single left guillemet
  'Œ': 0x8c, // OE
  'Ž': 0x8e, // Z caron
  '‘': 0x91, // left single quote
  '’': 0x92, // right single quote / apostrophe
  '“': 0x93, // left double quote
  '”': 0x94, // right double quote
  '•': 0x95, // bullet
  '–': 0x96, // en dash
  '—': 0x97, // em dash
  '˜': 0x98, // small tilde
  '™': 0x99, // trademark
  'š': 0x9a, // s caron
  '›': 0x9b, // single right guillemet
  'œ': 0x9c, // oe
  'ž': 0x9e, // z caron
  'Ÿ': 0x9f, // Y dieresis
}

/**
 * Characters that have no WinAnsi code but a fair ASCII stand-in. Losing the
 * shape of an arrow is a much smaller loss than losing the line it was on, so
 * these substitute silently and are NOT counted as dropped.
 */
const SUBSTITUTES: Record<string, string> = {
  '→': '->', '←': '<-', '↔': '<->',
  '⇒': '=>', '⇐': '<=',
  '≤': '<=', '≥': '>=', '≠': '!=',
  '−': '-', ' ': ' ', '​': '', ' ': ' ', ' ': ' ',
  '‑': '-', '‒': '-', '―': '-',
  '′': "'", '″': '"',
  '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x',
  '●': '*', '○': 'o', '◦': 'o', '▪': '-', '▫': '-', '‣': '-', '⁃': '-',
  '▶': '>', '◀': '<', '▸': '>',
  '✅': '[ok]', '❌': '[x]',
  ' ': ' ', ' ': ' ',
  'ﬁ': 'fi', 'ﬂ': 'fl',
}

export interface EncodeReport {
  /** Distinct characters that could not be written at all. */
  dropped: Set<string>
}

/**
 * A JS string as WinAnsi bytes.
 *
 * Anything unrepresentable becomes '?' and is recorded on `report`, so the UI
 * can say *which* characters went missing rather than leaving somebody to spot
 * it themselves halfway down page four.
 */
export function toWinAnsi(text: string, report?: EncodeReport): number[] {
  const out: number[] = []
  for (const ch of text) {
    const sub = SUBSTITUTES[ch]
    if (sub !== undefined) {
      for (const c of sub) out.push(c.charCodeAt(0))
      continue
    }
    const code = ch.codePointAt(0)!
    if (code === 9) { out.push(32); continue } // tab — the layout owns indentation
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      out.push(code)
      continue
    }
    const high = WIN_ANSI_HIGH[ch]
    if (high !== undefined) {
      out.push(high)
      continue
    }
    report?.dropped.add(ch)
    out.push(0x3f) // '?'
  }
  return out
}

/** The width of a string at a given size, in points. */
export function widthOfText(font: FontId, text: string, size: number): number {
  const metrics = FONT_METRICS[font]
  let units = 0
  for (const code of toWinAnsi(text)) units += metrics.widths[code] ?? metrics.fallback
  return (units * size) / 1000
}

// ── The document ─────────────────────────────────────────────────────────────

/** The base-14 names, in the order font objects are written. */
const FONT_NAMES: Record<FontId, string> = {
  helv: 'Helvetica',
  helvB: 'Helvetica-Bold',
  helvI: 'Helvetica-Oblique',
  helvBI: 'Helvetica-BoldOblique',
  times: 'Times-Roman',
  timesB: 'Times-Bold',
  timesI: 'Times-Italic',
  timesBI: 'Times-BoldItalic',
  cour: 'Courier',
  courB: 'Courier-Bold',
}

const FONT_IDS = Object.keys(FONT_NAMES) as FontId[]

interface LinkAnnot {
  rect: [number, number, number, number]
  url: string
}

/**
 * One page, accumulating content-stream operators.
 *
 * The op list is built as strings and joined at save time. A page of dense text
 * is a few thousand short strings, which is nothing next to the image bytes
 * beside it, and the alternative — encoding to bytes per op — makes every
 * drawing call allocate.
 */
export class PdfPage {
  readonly width: number
  readonly height: number
  private ops: string[] = []
  private images: PdfImage[] = []
  private links: LinkAnnot[] = []
  /** Fonts actually used, so a page's /Resources only names what it draws. */
  private usedFonts = new Set<FontId>()
  private report?: EncodeReport

  constructor(width: number, height: number, report?: EncodeReport) {
    this.width = width
    this.height = height
    this.report = report
  }

  /**
   * `y` is the BASELINE, and the origin is bottom-left — PDF's own convention,
   * kept rather than flipped so the ported layout engine reads the same in both
   * apps and a bug in one is recognisable in the other.
   */
  drawText(text: string, opts: { x: number; y: number; size: number; font: FontId; color: Rgb }): void {
    if (!text) return
    this.usedFonts.add(opts.font)
    const bytes = toWinAnsi(text, this.report)
    this.ops.push(
      'BT',
      `${num(opts.color.r)} ${num(opts.color.g)} ${num(opts.color.b)} rg`,
      `/${opts.font} ${num(opts.size)} Tf`,
      `${num(opts.x)} ${num(opts.y)} Td`,
      `${pdfStringFromBytes(bytes)} Tj`,
      'ET',
    )
  }

  drawRect(opts: {
    x: number
    y: number
    width: number
    height: number
    color?: Rgb
    borderColor?: Rgb
    borderWidth?: number
  }): void {
    if (opts.width <= 0 || opts.height <= 0) return
    const rectOp = `${num(opts.x)} ${num(opts.y)} ${num(opts.width)} ${num(opts.height)} re`
    if (opts.color) this.ops.push(`${num(opts.color.r)} ${num(opts.color.g)} ${num(opts.color.b)} rg`)
    if (opts.borderColor) {
      this.ops.push(
        `${num(opts.borderColor.r)} ${num(opts.borderColor.g)} ${num(opts.borderColor.b)} RG`,
        `${num(opts.borderWidth ?? 1)} w`,
      )
    }
    this.ops.push(rectOp, opts.color && opts.borderColor ? 'B' : opts.color ? 'f' : 'S')
  }

  drawImage(image: PdfImage, opts: { x: number; y: number; width: number; height: number }): void {
    const index = this.images.length
    this.images.push(image)
    this.ops.push(
      'q',
      `${num(opts.width)} 0 0 ${num(opts.height)} ${num(opts.x)} ${num(opts.y)} cm`,
      `/Im${index} Do`,
      'Q',
    )
  }

  /**
   * A clickable region. Kept separate from the drawing that makes it visible:
   * a link's underline is content and its hotspot is an annotation, and the two
   * are only in the same place because we put them there.
   */
  addLink(x1: number, y1: number, x2: number, y2: number, url: string): void {
    this.links.push({ rect: [x1, y1, x2, y2], url })
  }

  /** @internal */
  build(): { content: string; images: PdfImage[]; links: LinkAnnot[]; fonts: FontId[] } {
    return {
      content: this.ops.join('\n') + '\n',
      images: this.images,
      links: this.links,
      fonts: [...this.usedFonts],
    }
  }
}

export interface PdfMeta {
  title?: string
  author?: string
  /** Defaults to "Universal Converter". */
  producer?: string
}

export class PdfDocument {
  private pages: PdfPage[] = []
  /** Collected across every page, so the UI can report it once at the end. */
  readonly report: EncodeReport = { dropped: new Set() }

  addPage(width: number, height: number): PdfPage {
    const page = new PdfPage(width, height, this.report)
    this.pages.push(page)
    return page
  }

  get pageCount(): number {
    return this.pages.length
  }

  /**
   * Serialise. Object numbers are allocated as we go rather than computed from
   * a formula — the old `3 + i * 3` arithmetic in `pdf.ts` was correct only
   * while every page had exactly one image and no annotations, and a formula
   * that has to be re-derived every time the object graph changes is a bug
   * waiting for the next feature.
   */
  save(meta: PdfMeta = {}): Blob {
    if (!this.pages.length) throw new Error('A PDF needs at least one page.')

    const chunks: Uint8Array[] = []
    const offsets: number[] = []
    let length = 0
    let nextObject = 1

    const push = (data: string | Uint8Array) => {
      const bytes = typeof data === 'string' ? latin1(data) : data
      chunks.push(bytes)
      length += bytes.length
    }
    const alloc = () => nextObject++
    const begin = (n: number) => {
      offsets[n] = length
      push(`${n} 0 obj\n`)
    }
    const end = () => push('endobj\n')

    push('%PDF-1.4\n')
    // A comment of high bytes — what tells a transfer that treats the file as
    // text that it is binary. Every writer emits it; leaving it out breaks the
    // file on exactly the systems that are hardest to debug.
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

    const catalogId = alloc()
    const pagesId = alloc()

    // One font object per base-14 face, shared by every page. Ten small
    // dictionaries is less machinery than tracking which page wants which.
    const fontIds = new Map<FontId, number>()
    for (const id of FONT_IDS) {
      const objectId = alloc()
      fontIds.set(id, objectId)
      begin(objectId)
      push(
        `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_NAMES[id]} ` +
        `/Encoding /WinAnsiEncoding >>\n`,
      )
      end()
    }

    const pageIds: number[] = []

    for (const page of this.pages) {
      const built = page.build()
      const pageId = alloc()
      pageIds.push(pageId)

      const contentId = alloc()
      const imageIds = built.images.map(() => alloc())
      const linkIds = built.links.map(() => alloc())

      const fontResources = built.fonts
        .map((f) => `/${f} ${fontIds.get(f)} 0 R`)
        .join(' ')
      const xobjectResources = imageIds
        .map((id, i) => `/Im${i} ${id} 0 R`)
        .join(' ')

      const resources =
        `<< ${fontResources ? `/Font << ${fontResources} >> ` : ''}` +
        `${xobjectResources ? `/XObject << ${xobjectResources} >> ` : ''}>>`

      begin(pageId)
      push(
        `<< /Type /Page /Parent ${pagesId} 0 R ` +
        `/MediaBox [0 0 ${num(page.width)} ${num(page.height)}] ` +
        `/Resources ${resources} /Contents ${contentId} 0 R` +
        (linkIds.length ? ` /Annots [${linkIds.map((id) => `${id} 0 R`).join(' ')}]` : '') +
        ` >>\n`,
      )
      end()

      const contentBytes = latin1(built.content)
      begin(contentId)
      push(`<< /Length ${contentBytes.length} >>\nstream\n`)
      push(contentBytes)
      push('\nendstream\n')
      end()

      built.images.forEach((image, i) => {
        begin(imageIds[i])
        push(
          `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
          `/Length ${image.jpeg.length} >>\nstream\n`,
        )
        push(image.jpeg)
        push('\nendstream\n')
        end()
      })

      built.links.forEach((link, i) => {
        begin(linkIds[i])
        push(
          `<< /Type /Annot /Subtype /Link /Rect [${link.rect.map(num).join(' ')}] ` +
          `/Border [0 0 0] /A << /Type /Action /S /URI /URI ${pdfString(link.url)} >> >>\n`,
        )
        end()
      })
    }

    begin(pagesId)
    push(
      `<< /Type /Pages /Count ${pageIds.length} ` +
      `/Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>\n`,
    )
    end()

    begin(catalogId)
    push(`<< /Type /Catalog /Pages ${pagesId} 0 R >>\n`)
    end()

    const infoId = alloc()
    begin(infoId)
    push(
      `<< ${meta.title ? `/Title ${pdfString(meta.title)} ` : ''}` +
      `${meta.author ? `/Author ${pdfString(meta.author)} ` : ''}` +
      `/Producer ${pdfString(meta.producer ?? 'Universal Converter')} ` +
      `/Creator ${pdfString(meta.producer ?? 'Universal Converter')} >>\n`,
    )
    end()

    const xrefAt = length
    const count = nextObject
    push(`xref\n0 ${count}\n`)
    push('0000000000 65535 f \n')
    for (let n = 1; n < count; n += 1) {
      push(`${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`)
    }
    push(
      `trailer\n<< /Size ${count} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n` +
      `startxref\n${xrefAt}\n%%EOF\n`,
    )

    return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
  }
}

// ── Serialisation helpers ────────────────────────────────────────────────────

/**
 * Numbers in a content stream. Fixed to 2dp and stripped of a trailing '.00':
 * a raw JS float can serialise as `1e-7`, which is not a PDF number and makes
 * the whole stream unparseable from that operator on.
 */
function num(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const fixed = value.toFixed(2)
  return fixed.replace(/\.?0+$/, '') || '0'
}

/** A PDF literal string from already-encoded WinAnsi bytes. */
function pdfStringFromBytes(bytes: number[]): string {
  let out = '('
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += '\\'
    out += String.fromCharCode(b)
  }
  return out + ')'
}

function pdfString(text: string): string {
  return pdfStringFromBytes(toWinAnsi(text))
}

/** Latin-1 bytes. Every string that reaches this is already WinAnsi or ASCII. */
function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i) & 0xff
  return out
}
