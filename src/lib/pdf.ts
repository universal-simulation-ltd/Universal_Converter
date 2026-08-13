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

import { PdfDocument, type PdfImage } from './pdfcore'

export type PdfPageSource = PdfImage

/**
 * Draw a file to a canvas and read it back as JPEG.
 *
 * The white fill is not cosmetic: a canvas starts transparent, and drawing a
 * PNG with alpha onto it and asking for JPEG gives BLACK where the transparency
 * was on some browsers and white on others. Filling first makes it white
 * everywhere, which is what somebody printing a page expects.
 */
export async function imageToJpeg(file: Blob, quality: number, maxEdge: number | null): Promise<PdfPageSource> {
  const bitmap = await createImageBitmap(file)
  let { width, height } = bitmap
  if (maxEdge && Math.max(width, height) > maxEdge) {
    const scale = maxEdge / Math.max(width, height)
    width = Math.max(1, Math.round(width * scale))
    height = Math.max(1, Math.round(height * scale))
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser would not give us a canvas to draw on.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('This browser could not encode a JPEG.')
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width, height }
}

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
