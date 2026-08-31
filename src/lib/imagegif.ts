import { ColourCube, GifWriter, MAX_COLOURS, PaletteMap, quantiseFrame, ALPHA_THRESHOLD } from './gif'
import { decodeGif, readGifInfo } from './gifdecode'
import { withExtension } from './humanise'
import { targetSize } from './resize'
import type { ConvertedFile, ImageSettings } from './types'

/**
 * Image → GIF, including the case that used to fail silently: an animated GIF
 * in, an animated GIF out.
 *
 * ⚠️ **This exists because `convertImage` destroyed animations.** It decodes
 * with `createImageBitmap`, which returns frame one of an animated GIF and
 * gives no indication it dropped the rest — so converting one produced a still
 * with no warning, and a very impressive-looking size reduction. Universal
 * Compress shipped exactly the same bug and fixed it the same way; the reader
 * and the writer here are byte-identical copies of the pair in that repo.
 *
 * Two entry points, because the two jobs have nothing in common past the
 * palette: `convertAnimatedGif` reads a file's frames itself, while
 * `encodeStillAsGif` takes pixels the ordinary canvas path has already drawn.
 */

/**
 * An animated GIF, re-encoded frame by frame. `null` when `file` is not one —
 * a still GIF, or a PNG, which the ordinary canvas path handles better.
 *
 * The null is the whole interface. `convertImage` must know the answer before
 * it decides anything, and the answer costs a read of the file, so asking and
 * doing are one call rather than two.
 */
export async function convertAnimatedGif(
  file: File,
  settings: ImageSettings,
  onProgress: (fraction: number) => void = () => {},
): Promise<ConvertedFile | null> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const info = readGifInfo(bytes)
  if (!info || info.frames < 2) return null

  const { width, height } = targetSize(info.width, info.height, settings.maxEdge)

  // ── Pass one: the palette, and how the frames relate to one another ────────
  //
  // Two passes over the file rather than one, and the reason is memory: the
  // palette is chosen from the WHOLE animation (a per-frame palette makes the
  // picture shimmer and costs 768 bytes a frame), so nothing can be written
  // until every frame has been seen. Holding them instead of re-reading them is
  // 44 MB of live pixels for a 90-frame 640×360 GIF and near a gigabyte for a
  // long one. Decoding is cheap; keeping is not. Same shape as `videogif.ts`,
  // which decodes its clip twice for exactly this reason.
  //
  // ⚠️ The histogram is built from frames at their ORIGINAL size, before any
  // downscale. Scaling blends new intermediate colours into the edges that the
  // histogram then hasn't seen — but they land in the same 5-5-5 bins as the
  // colours they were blended from, so median cut still spends the palette in
  // the right places and `PaletteMap` finds each blend its nearest entry.
  const cube = new ColourCube()
  const delays: number[] = []
  let previousAlpha: Uint8Array | null = null
  let erases = false
  let transparent = false

  decodeGif(bytes, (frame) => {
    delays.push(frame.delayCs)
    cube.addFrame(frame.rgba)

    // Does anything ever get RUBBED OUT? A pixel that was opaque and becomes
    // transparent cannot be expressed by differencing, which can only add — see
    // the two-modes note on `GifWriter`. One such pixel anywhere in the file
    // decides how all of it is written, so this is asked once, here, rather
    // than guessed at.
    const alpha = new Uint8Array(frame.rgba.length / 4)
    for (let i = 0, p = 3; i < alpha.length; i++, p += 4) {
      const on = frame.rgba[p] >= ALPHA_THRESHOLD ? 1 : 0
      alpha[i] = on
      if (!on) transparent = true
      if (!erases && previousAlpha && previousAlpha[i] === 1 && on === 0) erases = true
    }
    previousAlpha = alpha

    onProgress(0.45 * ((frame.index + 1) / info.frames))
  })

  // ⚠️ The one repaint in the whole job. Both passes are synchronous — the
  // decoder hands frames to a plain callback, which is what lets it be a leaf
  // module the self-test can drive in Node — so the progress bar cannot move
  // while either is running, and the tab looks hung rather than busy. Yielding
  // here at least gets "45%" onto the screen before the second pass starts.
  await new Promise((resolve) => setTimeout(resolve, 0))

  const colours = cube.palette(paletteSize(settings.quality))
  const map = new PaletteMap(colours)

  // A source with no transparency at all can always be differenced; one that
  // only ever ADDS transparent area can too. Only rubbing out forces full
  // frames.
  const mode = transparent && erases ? 'full' : 'diff'

  // ── Pass two: quantise and write ──────────────────────────────────────────
  //
  // `info.loop` is carried across rather than defaulted: a GIF that was
  // authored to play once must not come back looping forever, and 0 — the
  // commonest value — means forever and is falsy, so it is passed as a number.
  const writer = new GifWriter(width, height, colours, info.loop ?? false, mode)
  const scale =
    width === info.width && height === info.height
      ? null
      : makeScaler(info.width, info.height, width, height)

  decodeGif(bytes, (frame) => {
    const pixels = scale ? scale(frame.rgba) : frame.rgba
    writer.addFrame(quantiseFrame(pixels, width, height, map, settings.dither), delays[frame.index])
    onProgress(0.45 + 0.55 * ((frame.index + 1) / info.frames))
  })

  onProgress(1)
  return { blob: blobOf(writer), name: withExtension(file.name, 'gif') }
}

/**
 * Pixels the canvas path has already drawn → a one-frame GIF.
 *
 * No Netscape looping block: a single frame has nothing to loop, and writing
 * one anyway would put four bytes of animation metadata into a still.
 */
export function encodeStillAsGif(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  settings: ImageSettings,
): Blob {
  const cube = new ColourCube()
  cube.addFrame(rgba)
  const colours = cube.palette(paletteSize(settings.quality))
  const writer = new GifWriter(width, height, colours, false)
  writer.addFrame(quantiseFrame(rgba, width, height, new PaletteMap(colours), settings.dither), 10)
  return blobOf(writer)
}

/**
 * Frames, if this file is an ANIMATED GIF; `null` for everything else.
 *
 * A scan of the block headers, not a decode — it steps over each frame's
 * compressed data by its sub-block lengths — so it is cheap enough to run on
 * every dropped file for the row's "· 48 frames" caption.
 */
export async function probeGifFrames(file: File): Promise<number | null> {
  try {
    const info = readGifInfo(new Uint8Array(await file.arrayBuffer()))
    return info && info.frames > 1 ? info.frames : null
  } catch {
    return null
  }
}

/**
 * How many colours the quality control is asking for.
 *
 * The three stops are 0.6 / 0.82 / 0.95, so this is 153 / 209 / 242 of the 255
 * the format allows. Floored at 32, because below that the picture stops being
 * the picture and a palette that small saves very little anyway — LZW is
 * compressing runs of indices, and it is the runs that matter, not how wide
 * each index is.
 */
function paletteSize(quality: number): number {
  return Math.max(32, Math.min(MAX_COLOURS, Math.round(quality * MAX_COLOURS)))
}

function blobOf(writer: GifWriter): Blob {
  return new Blob(writer.finish() as BlobPart[], { type: 'image/gif' })
}

/**
 * A reusable full-size → output-size scaler.
 *
 * Two canvases, made once and reused for every frame: `putImageData` ignores
 * transforms, so the pixels have to land on a canvas at their own size before
 * anything can draw them smaller. A pair per frame is how a 500-frame GIF
 * allocates a thousand canvases and the tab dies.
 *
 * ⚠️ `clearRect` before each `drawImage` is load-bearing. The destination is
 * reused, and a frame with transparent areas composites OVER whatever the last
 * frame left there — so without it the output accumulates every frame of the
 * animation on top of one another.
 */
function makeScaler(
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
): (rgba: Uint8ClampedArray) => Uint8ClampedArray {
  const source = document.createElement('canvas')
  source.width = sourceWidth
  source.height = sourceHeight
  const sourceCtx = source.getContext('2d', { willReadFrequently: true })
  const target = document.createElement('canvas')
  target.width = width
  target.height = height
  const targetCtx = target.getContext('2d', { willReadFrequently: true })
  if (!sourceCtx || !targetCtx) throw new Error('This browser wouldn’t give us a canvas to draw on')

  targetCtx.imageSmoothingQuality = 'high'
  const image = sourceCtx.createImageData(sourceWidth, sourceHeight)

  return (rgba) => {
    image.data.set(rgba)
    sourceCtx.putImageData(image, 0, 0)
    targetCtx.clearRect(0, 0, width, height)
    targetCtx.drawImage(source, 0, 0, width, height)
    return targetCtx.getImageData(0, 0, width, height).data
  }
}
