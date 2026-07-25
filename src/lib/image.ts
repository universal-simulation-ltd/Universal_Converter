import { imageFormatMeta, imageFormatSupported } from './formats'
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

  const bitmap = await decode(file)
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

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, meta.mime, meta.lossy ? settings.quality : undefined),
    )
    if (!blob) throw new Error('The image couldn’t be encoded')
    onProgress(1)

    return { blob, name: withExtension(file.name, meta.ext) }
  } finally {
    bitmap.close()
  }
}

// createImageBitmap covers PNG/JPEG/WebP/GIF/AVIF wherever the browser can
// decode them at all. SVG is the exception in some engines, so it falls back to
// an <img> element, which always rasterises at the SVG's intrinsic size.
async function decode(file: File): Promise<ImageBitmap> {
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

/** "1920 × 1080" for the queue row, read without decoding the whole file. */
export function probeDimensions(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    let settled = false
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), 5000)
    img.onload = () => finish(`${img.naturalWidth} × ${img.naturalHeight}`)
    img.onerror = () => finish(null)
    img.src = url
  })
}
