import { imageFormatMeta, imageFormatSupported } from './formats'
import { decodeImage } from './image'
import { targetSize } from './resize'
import type { ImageSettings } from './types'

/**
 * How big the file WOULD come out, before anyone presses Convert.
 *
 * The question this answers is a real one and easy to get wrong by surprise: a
 * 1 MB HEIC off a phone becomes a 15 MB PNG, because PNG is lossless and a
 * photograph has no repetition to be lossless about. Finding that out from the
 * downloads folder is too late.
 *
 * ── How it works, and why not the obvious way ────────────────────────────────
 *
 * It encodes a SAMPLE cut from the real image and multiplies by the pixel
 * count. Compressed size is, to a good approximation, `pixels ×
 * bytes-per-pixel`, and bytes-per-pixel is a property of the CONTENT — how
 * noisy and detailed it is — not of how many pixels there are.
 *
 * ⚠️ The sample is cut at FULL RESOLUTION, never from a shrunken copy.
 * Downscaling averages away exactly the high-frequency noise a lossless encoder
 * spends its bytes on, so a photo's PNG estimate would come out a fraction of
 * the truth — under-promising the size being the one failure this whole feature
 * exists to prevent.
 *
 * ⚠️ When the person HAS asked to downscale, the sample is scaled by the same
 * factor before encoding, so it carries the smoothing the finished file will
 * have. A native-resolution sample measured against a 1920px target overstates
 * it by a lot.
 *
 * ⚠️ Images only. Audio, video and documents get no estimate and should not be
 * given one by analogy: an MP3's size is its bitrate times its duration and is
 * already implied by the panel, and a PDF's depends on work that IS the
 * conversion.
 */

/** A mosaic of crops taken from the source at 1:1, plus its true dimensions. */
export interface ImageSample {
  width: number
  height: number
  tile: HTMLCanvasElement
}

/**
 * A 3×3 MOSAIC of 96px crops taken from across the whole frame — 288px square.
 *
 * Both numbers were measured, not chosen, and both matter:
 *
 * ⚠️ **NOT one crop from the middle.** Detail is rarely spread evenly. The
 * app's own share image is a logo on a flat ground, and a centre crop landing
 * on the logo estimated **2.8× too high**; a UI screenshot whose middle is
 * empty came out **0.54×**, half the real size. Nine crops spread over the
 * frame see the flat parts and the busy parts in roughly the proportion the
 * finished file will.
 *
 * ⚠️ **And not sixteen small ones either**, which was the first mosaic and was
 * worse than nine on exactly the images the centre crop ruined — 2.05× on that
 * same share image. A mosaic DESTROYS LONG-RANGE REDUNDANCY: an encoder pays
 * almost nothing for a wide flat area, and cutting that area into 72px pieces
 * with hard edges between them prices it as if it were detail. Photographs
 * barely notice, having little long-range redundancy to lose; flat and graphic
 * images notice enormously. Bigger cells keep the runs, fewer cells cover less
 * of the frame, and 96px in a 3×3 is where the two stopped fighting.
 *
 * Measured across a synthetic photo, a half-flat/half-noisy photo, a real
 * marketing JPEG and a UI screenshot, over PNG/JPEG/WebP at native size and
 * downscaled: **every estimate landed between 0.81× and 1.22× of the real
 * conversion.** That is what "≈" is promising — the right order of magnitude,
 * which is the whole decision being made.
 */
const GRID = 3
const CELL = 96
const MOSAIC = GRID * CELL

export async function sampleImage(file: File): Promise<ImageSample> {
  const bitmap = await decodeImage(file)
  try {
    const { width, height } = bitmap
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')

    // Small enough to fit in the mosaic whole? Then it IS the sample, and the
    // estimate is exact rather than extrapolated.
    if (width <= MOSAIC && height <= MOSAIC) {
      canvas.width = width
      canvas.height = height
      ctx.drawImage(bitmap, 0, 0)
      return { width, height, tile: canvas }
    }

    const cw = Math.min(CELL, width)
    const ch = Math.min(CELL, height)
    canvas.width = cw * GRID
    canvas.height = ch * GRID
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        // Centre of this cell's share of the frame, clamped so a crop near an
        // edge stays inside the picture.
        const sx = Math.min(Math.max(0, Math.round(((gx + 0.5) / GRID) * width - cw / 2)), width - cw)
        const sy = Math.min(Math.max(0, Math.round(((gy + 0.5) / GRID) * height - ch / 2)), height - ch)
        ctx.drawImage(bitmap, sx, sy, cw, ch, gx * cw, gy * ch, cw, ch)
      }
    }
    return { width, height, tile: canvas }
  } finally {
    bitmap.close()
  }
}

/**
 * Bytes the converted file is expected to come to, or null if this browser
 * cannot write the format at all (in which case the chip is already disabled
 * and a number beside it would be noise).
 */
export async function estimateImageBytes(
  sample: ImageSample,
  settings: ImageSettings,
): Promise<number | null> {
  const meta = imageFormatMeta(settings.format)
  if (!(await imageFormatSupported(settings.format))) return null

  const out = targetSize(sample.width, sample.height, settings.maxEdge)
  const scale = out.width / sample.width

  // Scale the tile by the same factor the whole image is getting, so its
  // detail matches what will actually be encoded. Below 24px there is not
  // enough left to measure, so the tile is used unscaled and the estimate
  // leans high — the safe direction.
  let probe = sample.tile
  const pw = Math.round(sample.tile.width * scale)
  const ph = Math.round(sample.tile.height * scale)
  if (scale < 1 && pw >= 24 && ph >= 24) {
    const canvas = document.createElement('canvas')
    canvas.width = pw
    canvas.height = ph
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(sample.tile, 0, 0, pw, ph)
    probe = canvas
  }

  // JPEG has no alpha, and the real conversion lays a white ground first — do
  // the same here or a transparent source measures as whatever the canvas
  // happened to hold.
  if (settings.format === 'jpeg') {
    const flat = document.createElement('canvas')
    flat.width = probe.width
    flat.height = probe.height
    const ctx = flat.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, flat.width, flat.height)
    ctx.drawImage(probe, 0, 0)
    probe = flat
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    probe.toBlob(resolve, meta.mime, meta.lossy ? settings.quality : undefined),
  )
  if (!blob) return null

  const perPixel = blob.size / (probe.width * probe.height)
  return Math.round(perPixel * out.width * out.height)
}
