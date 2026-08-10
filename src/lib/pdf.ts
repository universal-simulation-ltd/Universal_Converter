// ---------------------------------------------------------------------------
// A minimal PDF writer — images in, one PDF out.
//
// WHY THIS IS HAND-WRITTEN
// ------------------------
// pdf-lib is about a megabyte, and this app's whole pitch is that it is small
// and runs on your device. It already refuses ffmpeg.wasm and writes its own
// ZIP (`zip.ts`), its own Ogg container (`opus.ts`) and its own MP4 boxes, so a
// PDF that only has to hold pictures is the same kind of job: a PDF is a
// handful of numbered objects, a cross-reference table and a trailer. What it
// does NOT do is anything a PDF library is actually for — no text, no fonts,
// no forms, no editing an existing file. If any of that is ever wanted, take
// the dependency then rather than growing this.
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
// The alternative — `/FlateDecode` with raw RGB — needs a deflate encoder this
// app does not have, and storing raw RGB uncompressed would produce a 20 MB
// page from a 2 MP photo. JPEG is the honest choice at this size; saying so is
// the other half of it.
// ---------------------------------------------------------------------------

/** 72 PDF points per inch, and we lay images out at 72 dpi. */
const POINTS_PER_PX = 1

export interface PdfPageSource {
  /** JPEG bytes, already encoded. */
  jpeg: Uint8Array
  width: number
  height: number
}

/**
 * Draw a file to a canvas and read it back as JPEG.
 *
 * The white fill is not cosmetic: a canvas starts transparent, and drawing a
 * PNG with alpha onto it and asking for JPEG gives BLACK where the transparency
 * was on some browsers and white on others. Filling first makes it white
 * everywhere, which is what somebody printing a page expects.
 */
export async function imageToJpeg(file: File, quality: number, maxEdge: number | null): Promise<PdfPageSource> {
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
 * Assemble pages into a PDF.
 *
 * Object layout, which is the whole format at this level of ambition:
 *   1        the Catalog
 *   2        the Pages tree
 *   3+3n     page n
 *   4+3n     page n's content stream (one `Do` — draw the image, full bleed)
 *   5+3n     page n's image XObject
 */
export function buildPdf(pages: readonly PdfPageSource[], title: string): Blob {
  if (!pages.length) throw new Error('A PDF needs at least one page.')

  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0

  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? latin1(data) : data
    chunks.push(bytes)
    length += bytes.length
  }
  /** Record where an object starts, so the xref table can point at it. */
  const startObject = (n: number) => {
    offsets[n] = length
    push(`${n} 0 obj\n`)
  }

  push('%PDF-1.4\n')
  // A comment of high bytes, which is what tells a transfer that treats the
  // file as text that it is binary. Every writer emits it; leaving it out
  // breaks the file on exactly the systems hardest to debug.
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

  const pageIds = pages.map((_, i) => 3 + i * 3)

  startObject(1)
  push(`<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`)

  startObject(2)
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>\nendobj\n`)

  pages.forEach((page, i) => {
    const pageId = pageIds[i]
    const contentId = pageId + 1
    const imageId = pageId + 2
    const w = page.width * POINTS_PER_PX
    const h = page.height * POINTS_PER_PX

    startObject(pageId)
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
      `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    )

    // The page is the image and nothing else: scale the unit square up to the
    // MediaBox and draw once.
    const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`
    startObject(contentId)
    push(`<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`)

    startObject(imageId)
    push(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
    )
    push(page.jpeg)
    push('\nendstream\nendobj\n')
  })

  const infoId = 3 + pages.length * 3
  startObject(infoId)
  push(`<< /Title (${escapeText(title)}) /Producer (Universal Converter) >>\nendobj\n`)

  const xrefAt = length
  const count = infoId + 1
  push(`xref\n0 ${count}\n`)
  push('0000000000 65535 f \n')
  for (let n = 1; n < count; n += 1) {
    push(`${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`)
  }
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`)

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

/**
 * PDF strings are bytes, not Unicode, so anything above U+00FF cannot go in a
 * plain `( … )` literal. The title is metadata nobody reads aloud, so
 * out-of-range characters are dropped rather than mojibaked.
 */
function escapeText(s: string): string {
  return [...s]
    .filter((c) => c.codePointAt(0)! <= 0xff)
    .join('')
    .replace(/[\\()]/g, (c) => `\\${c}`)
}

/** Latin-1 bytes. Every string this file writes is structure, so ASCII-only. */
function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i) & 0xff
  return out
}
