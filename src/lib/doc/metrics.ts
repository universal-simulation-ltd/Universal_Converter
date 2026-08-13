// ---------------------------------------------------------------------------
// Glyph widths for the base-14 PDF fonts.
//
// This table is the entire price of writing text without a PDF library. Every
// reader already HAS these fonts, so nothing is embedded and nothing is
// subsetted — but the writer still has to know how wide each character is, or
// it cannot break a line, centre a heading or size a table column.
//
// Widths are Adobe's own AFM values, in 1/1000 em: a character of width 556 at
// 11pt occupies 556 × 11 / 1000 = 6.116pt. They are given for WinAnsi code
// points, which is the encoding every font object here declares, so the index
// into these tables is the *byte* that ends up in the PDF, not the Unicode code
// point. The two agree below 127 and again from 160 to 255, and differ over
// 128–159 — the Windows-1252 block that holds smart quotes, dashes, the bullet
// and the ellipsis. That block is the one worth having: it is what a word
// processor actually emits.
//
// The oblique/italic faces of Helvetica are METRICALLY IDENTICAL to the upright
// ones — the glyphs are slanted, not redrawn — so they share a table. Times'
// italics are genuinely different designs and have their own. Courier is
// monospaced: every glyph is 600, which is why it needs no table at all.
// ---------------------------------------------------------------------------

export type FontId =
  | 'helv' | 'helvB' | 'helvI' | 'helvBI'
  | 'times' | 'timesB' | 'timesI' | 'timesBI'
  | 'cour' | 'courB'

export interface FontMetrics {
  /** Indexed by WinAnsi byte. Sparse — undefined means "no glyph". */
  widths: number[]
  /** Used for codes with no glyph. They render as '?', which has a width. */
  fallback: number
}

/**
 * Expand the compact form.
 *
 * `ascii` is 95 widths for codes 32–126, `high` is 96 for codes 160–255, and
 * `extras` is the sparse 128–159 block written as `code:width` pairs. Three
 * strings per font rather than a 224-entry literal each: the table is data, and
 * data that takes six screens to scroll past is data nobody will ever check.
 */
function build(ascii: string, extras: string, high: string, fallback: number): FontMetrics {
  const widths: number[] = []
  ascii.trim().split(/\s+/).forEach((w, i) => { widths[32 + i] = Number(w) })
  high.trim().split(/\s+/).forEach((w, i) => { widths[160 + i] = Number(w) })
  for (const pair of extras.trim().split(/\s+/)) {
    const [code, width] = pair.split(':')
    widths[Number(code)] = Number(width)
  }
  return { widths, fallback }
}

// ── Helvetica ────────────────────────────────────────────────────────────────

const HELVETICA = build(
  // 32–126
  `278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278
   556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556
   1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778
   667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556
   333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556
   556 556 333 500 278 556 500 722 500 500 500 334 260 334 584`,
  // 128–159
  `128:556 130:222 131:556 132:333 133:1000 134:556 135:556 136:333
   137:1000 138:667 139:333 140:1000 142:611 145:222 146:222 147:333
   148:333 149:350 150:556 151:1000 152:333 153:1000 154:500 155:333
   156:944 158:500 159:667`,
  // 160–255
  `278 333 556 556 556 556 260 556 333 737 370 556 584 333 737 333
   400 584 333 333 333 556 537 278 333 333 365 556 834 834 834 611
   667 667 667 667 667 667 1000 722 667 667 667 667 278 278 278 278
   722 722 778 778 778 778 778 584 778 722 722 722 722 667 667 611
   556 556 556 556 556 556 889 500 556 556 556 556 278 278 278 278
   556 556 556 556 556 556 556 584 611 556 556 556 556 500 556 500`,
  556,
)

const HELVETICA_BOLD = build(
  `278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278
   556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611
   975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778
   667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556
   333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611
   611 611 389 556 333 611 556 778 556 556 500 389 280 389 584`,
  `128:556 130:278 131:556 132:500 133:1000 134:556 135:556 136:333
   137:1000 138:667 139:333 140:1000 142:611 145:278 146:278 147:500
   148:500 149:350 150:556 151:1000 152:333 153:1000 154:556 155:333
   156:944 158:500 159:667`,
  `278 333 556 556 556 556 280 556 333 737 370 556 584 333 737 333
   400 584 333 333 333 611 556 278 333 333 365 556 834 834 834 611
   722 722 722 722 722 722 1000 722 667 667 667 667 278 278 278 278
   722 722 778 778 778 778 778 584 778 722 722 722 722 667 667 611
   556 556 556 556 556 556 889 556 556 556 556 556 278 278 278 278
   611 611 611 611 611 611 611 584 611 611 611 611 611 556 611 556`,
  556,
)

// ── Times ────────────────────────────────────────────────────────────────────

const TIMES = build(
  `250 333 408 500 500 833 778 180 333 333 500 564 250 333 250 278
   500 500 500 500 500 500 500 500 500 500 278 278 564 564 564 444
   921 722 667 667 722 611 556 722 722 333 389 722 611 889 722 722
   556 722 667 556 611 722 722 944 722 722 611 333 278 333 469 500
   333 444 500 444 500 444 333 500 500 278 278 500 278 778 500 500
   500 500 333 389 278 500 500 722 500 500 444 480 200 480 541`,
  `128:500 130:333 131:500 132:444 133:1000 134:500 135:500 136:333
   137:1000 138:556 139:333 140:889 142:611 145:333 146:333 147:444
   148:444 149:350 150:500 151:1000 152:333 153:980 154:389 155:333
   156:722 158:444 159:722`,
  `250 333 500 500 500 500 200 500 333 760 276 500 564 333 760 333
   400 564 300 300 333 500 453 250 333 300 310 500 750 750 750 444
   722 722 722 722 722 722 889 667 611 611 611 611 333 333 333 333
   722 722 722 722 722 722 722 564 722 722 722 722 722 722 556 500
   444 444 444 444 444 444 667 444 444 444 444 444 278 278 278 278
   500 500 500 500 500 500 500 564 500 500 500 500 500 500 500 500`,
  500,
)

const TIMES_BOLD = build(
  `250 333 555 500 500 1000 833 278 333 333 500 570 250 333 250 278
   500 500 500 500 500 500 500 500 500 500 333 333 570 570 570 500
   930 722 667 722 722 667 611 778 778 389 500 778 667 944 722 778
   611 778 722 556 667 722 722 1000 722 722 667 333 278 333 581 500
   333 500 556 444 556 444 333 500 556 278 333 556 278 833 556 500
   556 556 444 389 333 556 500 722 500 500 444 394 220 394 520`,
  `128:500 130:333 131:500 132:500 133:1000 134:500 135:500 136:333
   137:1000 138:556 139:333 140:1000 142:667 145:333 146:333 147:500
   148:500 149:350 150:500 151:1000 152:333 153:1000 154:389 155:333
   156:722 158:444 159:722`,
  `250 333 500 500 500 500 220 500 333 747 300 500 570 333 747 333
   400 570 300 300 333 556 540 250 333 300 330 500 750 750 750 500
   722 722 722 722 722 722 1000 722 667 667 667 667 389 389 389 389
   722 722 778 778 778 778 778 570 778 722 722 722 722 722 611 556
   500 500 500 500 500 500 722 444 444 444 444 444 278 278 278 278
   500 556 500 500 500 500 500 570 500 556 556 556 556 500 556 500`,
  500,
)

const TIMES_ITALIC = build(
  `250 333 420 500 500 833 778 214 333 333 500 675 250 333 250 278
   500 500 500 500 500 500 500 500 500 500 333 333 675 675 675 500
   920 611 611 667 722 611 611 722 722 333 444 667 556 833 667 722
   611 722 611 500 556 722 611 833 611 556 556 389 278 389 422 500
   333 500 500 444 500 444 278 500 500 278 278 444 278 722 500 500
   500 500 389 389 278 500 444 667 444 444 389 400 275 400 541`,
  `128:500 130:333 131:500 132:556 133:889 134:500 135:500 136:333
   137:1000 138:556 139:333 140:944 142:556 145:333 146:333 147:556
   148:556 149:350 150:500 151:889 152:333 153:980 154:389 155:333
   156:667 158:389 159:556`,
  `250 389 500 500 500 500 275 500 333 760 276 500 675 333 760 333
   400 675 300 300 333 500 523 250 333 300 310 500 750 750 750 500
   611 611 611 611 611 611 889 667 611 611 611 611 333 333 333 333
   722 667 722 722 722 722 722 675 722 722 722 722 722 556 611 500
   500 500 500 500 500 500 667 444 444 444 444 444 278 278 278 278
   500 500 500 500 500 500 500 675 500 500 500 500 500 444 500 444`,
  500,
)

const TIMES_BOLD_ITALIC = build(
  `250 389 555 500 500 833 778 278 333 333 500 570 250 333 250 278
   500 500 500 500 500 500 500 500 500 500 333 333 570 570 570 500
   832 667 667 667 722 667 667 722 778 389 500 667 611 889 722 722
   611 722 667 556 611 722 667 889 667 611 611 333 278 333 570 500
   333 500 500 444 500 444 333 500 556 278 278 500 278 778 556 500
   500 500 389 389 278 556 444 667 500 444 389 348 220 348 570`,
  `128:500 130:333 131:500 132:500 133:1000 134:500 135:500 136:333
   137:1000 138:556 139:333 140:944 142:611 145:333 146:333 147:500
   148:500 149:350 150:500 151:1000 152:333 153:1000 154:389 155:333
   156:722 158:389 159:611`,
  `250 389 500 500 500 500 220 500 333 747 266 500 606 333 747 333
   400 570 300 300 333 576 500 250 333 300 300 500 750 750 750 500
   667 667 667 667 667 667 944 667 667 667 667 667 389 389 389 389
   722 722 722 722 722 722 722 570 722 722 722 722 722 611 611 500
   500 500 500 500 500 500 722 444 444 444 444 444 278 278 278 278
   500 556 500 500 500 500 500 570 500 556 556 556 556 444 500 444`,
  500,
)

/** Courier is monospaced — 600 for everything, glyph or not. */
const COURIER: FontMetrics = { widths: [], fallback: 600 }

export const FONT_METRICS: Record<FontId, FontMetrics> = {
  helv: HELVETICA,
  helvB: HELVETICA_BOLD,
  // Oblique is the same outlines on a slant, so the same advance widths.
  helvI: HELVETICA,
  helvBI: HELVETICA_BOLD,
  times: TIMES,
  timesB: TIMES_BOLD,
  timesI: TIMES_ITALIC,
  timesBI: TIMES_BOLD_ITALIC,
  cour: COURIER,
  courB: COURIER,
}

/** The four faces of one family, chosen by weight and slant. */
export interface FontFamily {
  regular: FontId
  bold: FontId
  italic: FontId
  boldItalic: FontId
}

export const SANS: FontFamily = { regular: 'helv', bold: 'helvB', italic: 'helvI', boldItalic: 'helvBI' }
export const SERIF: FontFamily = { regular: 'times', bold: 'timesB', italic: 'timesI', boldItalic: 'timesBI' }
export const MONO: FontFamily = { regular: 'cour', bold: 'courB', italic: 'cour', boldItalic: 'courB' }
