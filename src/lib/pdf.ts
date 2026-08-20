// ---------------------------------------------------------------------------
// Images → one PDF.
//
// The PDF machinery itself moved to `pdfcore.ts` when the Files tab needed text
// pages, and this file kept only the part that is about PICTURES: re-encoding
// to JPEG, and one full-bleed page per image. Two writers in one app is how you
// get two PDFs that disagree about their own metadata, so there is one.
//
// EVERY PAGE IS A JPEG, AND THAT IS A REAL TRADE
// ----------------------------------------------
// Images are re-encoded to JPEG and embedded with `/DCTDecode`, which is the
// one filter every reader supports and the only one that lets the compressed
// bytes go in untouched. The cost is stated in the UI rather than hidden:
//
//   * it is LOSSY — a PNG screenshot of text will soften slightly;
//   * TRANSPARENCY IS FLATTENED onto white, because JPEG has no alpha.
//
// The alternative — `/FlateDecode` with raw RGB — needs a deflate encoder, and
// storing raw RGB uncompressed would produce a 20 MB page from a 2 MP photo.
// (`CompressionStream` could do it now, and the same reasoning that let the
// Files tab write its own text engine would allow it — but JPEG is the honest
// choice at this size, and saying so is the other half of it.)
// ---------------------------------------------------------------------------

// The PDF primitives and the JPEG re-encoder both moved to `@unisim/doc` with
// the rest of the document stack — the document WRITER needs the same
// re-encoder for a `{ kind: 'image' }` block, and one copy is the point of the
// package. What is left in this file is the app feature that is genuinely this
// app's: one full-bleed page per picture.
import { PdfDocument, imageToJpeg, type PdfImage } from '@unisim/doc'

export type PdfPageSource = PdfImage
export { imageToJpeg }

/**
 * Assemble pages into a PDF — one image per page, laid out at 72 dpi so a
 * pixel is a point and the page is exactly the size of the picture on it.
 */
export function buildPdf(pages: readonly PdfPageSource[], title: string): Blob {
  if (!pages.length) throw new Error('A PDF needs at least one page.')

  const pdf = new PdfDocument()
  for (const image of pages) {
    const page = pdf.addPage(image.width, image.height)
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  }
  return pdf.save({ title })
}
