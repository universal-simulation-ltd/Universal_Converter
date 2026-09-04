import { imageFormatMeta, imageFormatSupported } from './formats'
import { isHeicFile } from './heicSniff'
import { withExtension } from './humanise'
import { targetSize } from './resize'
import type { ConvertedFile, ImageSettings } from './types'

/**
 * Convert one image with the browser's own decoder and canvas encoder: decode →
 * (optional) downscale → re-encode. No library, no download, nothing leaves the
 * tab — the same local-first story as the audio side.
 */
export async function convertImage(
  file: File,
  settings: ImageSettings,
  onProgress: (fraction: number) => void = () => {},
): Promise<ConvertedFile> {
  const meta = imageFormatMeta(settings.format)
  if (!(await imageFormatSupported(settings.format))) {
    throw new Error(`This browser can’t write ${meta.label} — try WebP, JPEG or PNG`)
  }

  // ⚠️ **Before the decode, and it stays there.** `decodeImage` is
  // `createImageBitmap`, which on an animated GIF returns FRAME ONE and gives
  // no flag, no warning and no error — so an animation reaching it does not
  // fail, it succeeds at producing a still. Until this branch existed, that is
  // exactly what converting an animated GIF did, silently, and the resulting
  // file was tiny enough to look like a triumph.
  //
  // Dynamic: the reader, the palette builder and the LZW coder are ~15 KB that
  // nobody converting a photograph should download.
  if (settings.format === 'gif') {
    const { convertAnimatedGif } = await import('./imagegif')
    const animated = await convertAnimatedGif(file, settings, onProgress)
    if (animated) return animated
    // A still GIF, or any other image, falls through: there is no animation to
    // protect, and the canvas below scales it better than we would by hand.
  }

  const bitmap = await decodeImage(file)
  onProgress(0.4)

  try {
    const { width, height } = targetSize(bitmap.width, bitmap.height, settings.maxEdge)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser wouldn’t give us a canvas to draw on')

    // JPEG has no alpha: without a white ground, transparent pixels come out
    // black instead of the white everyone expects.
    if (settings.format === 'jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)
    onProgress(0.7)

    // GIF is the one target with no `toBlob` behind it — no engine has ever
    // shipped a GIF encoder — so the pixels go to our own writer instead. Note
    // it reads them back off the canvas rather than from the source bitmap:
    // that way the downscale, the aspect ratio and the alpha handling above are
    // the same code for every format, and only the encoder differs.
    let blob: Blob | null
    if (settings.format === 'gif') {
      const { encodeStillAsGif } = await import('./imagegif')
      blob = encodeStillAsGif(ctx.getImageData(0, 0, width, height).data, width, height, settings)
    } else {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, meta.mime, meta.lossy ? settings.quality : undefined),
      )
    }
    if (!blob) throw new Error('The image couldn’t be encoded')
    onProgress(1)

    return { blob, name: withExtension(file.name, meta.ext) }
  } finally {
    bitmap.close()
  }
}

// Is this the thing a phone hands you? Name, MIME *and* the file's own first
// bytes — see heicSniff.ts, which explains why the first two are not enough on
// Android and is the same file in Compress and PDF.

/**
 * HEIC/HEIF → an ImageBitmap, so the rest of this file can treat an iPhone
 * photo as any other raster.
 *
 * This is the ONLY input in the app that needs a decoder shipped with it:
 * Safari reads HEIC natively, and no other engine will touch it at all —
 * `createImageBitmap` and <img> both simply fail. It is ~3 MB, so it is
 * dynamic-imported on the first HEIC and never costs anyone who does not drop
 * one.
 *
 * ⚠️ **`heic-to` (libheif 1.19), NOT `heic2any`.** The first cut of this used
 * heic2any, which is the library Universal Images has always used, and it
 * decoded every HEIC written here — including a 4032×3024 one — while failing
 * on EVERY REAL PHOTO OFF AN IPHONE. heic2any 0.0.4 is from 2020 and bundles a
 * libheif from around 1.7; an iPhone stores its main image as a `grid` of HEVC
 * tiles with auxiliary items beside it, and HDR shots are 10-bit, none of which
 * that build handles. A synthetic fixture is a single 8-bit `hvc1` item and
 * sails through, which is exactly why the e2e went green on something the app
 * could not actually do. **A generated HEIC does not test HEIC.**
 *
 * `type: 'bitmap'` rather than a JPEG: the old path decoded to JPEG and then
 * re-encoded that to the real target, so a PNG output carried JPEG artefacts it
 * had no reason to. This hands back pixels.
 */
async function heicToBitmap(file: File): Promise<ImageBitmap> {
  const { heicTo } = await import('heic-to')
  try {
    return await heicTo({ blob: file, type: 'bitmap' })
  } catch (e) {
    // ⚠️ NAME THE CAUSE. The first version swallowed it for a friendly line,
    // and when real iPhone photos failed there was nothing on the row to say
    // why — the message blamed the file and hid the decoder.
    const why = e instanceof Error ? e.message : String(e)
    throw new Error(`This HEIC couldn’t be decoded — ${why}`)
  }
}

// createImageBitmap covers PNG/JPEG/WebP/GIF/AVIF wherever the browser can
// decode them at all. SVG is the exception in some engines, so it falls back to
// an <img> element, which always rasterises at the SVG's intrinsic size.
//
// Exported because `estimate.ts` needs the SAME decoder this file converts
// with, HEIC branch and all — a size estimate produced by a second, weaker
// decode path would be an estimate of a different picture.
export async function decodeImage(file: File): Promise<ImageBitmap> {
  // Before the try, not inside its catch: on Safari `createImageBitmap` would
  // succeed on a HEIC and never reach a fallback, so the two engines would take
  // different paths and only one of them would be the tested one.
  if (await isHeicFile(file)) return await heicToBitmap(file)

  try {
    return await createImageBitmap(file)
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.decoding = 'async'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('decode failed'))
        img.src = url
      })
      return await createImageBitmap(img)
    } catch {
      throw new Error('This image couldn’t be decoded — it may be corrupt or use a format this browser can’t read')
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}
