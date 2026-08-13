// ---------------------------------------------------------------------------
// The PDF settings, on their own — types and defaults, no engine.
//
// ⚠️ THIS FILE EXISTS SO THE LAYOUT ENGINE STAYS OUT OF THE MAIN BUNDLE, and it
// is worth knowing why before anyone tidies it back into `pdf.ts`.
//
// The settings panel needs `DEFAULT_PDF_SETTINGS` at startup, so the store
// imports it STATICALLY. `write/pdf.ts` is imported DYNAMICALLY, to keep the
// renderer and its font tables out of the way of somebody converting a JPEG.
// When both imports point at the same module, a bundler resolves the conflict
// the only way it can — by giving up on the split and putting the whole module
// in the main chunk. Vite says so out loud:
//
//   (!) write/pdf.ts is dynamically imported but also statically imported,
//       dynamic import will not move module into another chunk.
//
// Splitting the constants out is what makes the lazy import actually lazy.
// ---------------------------------------------------------------------------

export type PaperSize = 'A4' | 'Letter' | 'A5' | 'A3'
export type PageMargin = 'narrow' | 'normal' | 'wide'
export type FontChoice = 'sans' | 'serif'

export interface PdfSettings {
  paper: PaperSize
  font: FontChoice
  /** Body size in points. Headings, code and tables all scale from it. */
  fontSize: number
  margin: PageMargin
  pageNumbers: boolean
}

export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  paper: 'A4',
  font: 'sans',
  fontSize: 11,
  margin: 'normal',
  pageNumbers: true,
}
