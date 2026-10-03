import { ColourCube, GifWriter, PaletteMap, quantiseFrame } from './gif'
import { readGifInfo } from './gifdecode'
import { encodeAnimatedGif, paletteSize } from './gifanim'
import GifAnimWorker from './gifanim.worker?worker'
import { withExtension } from './humanise'
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

  // In a worker where the browser can give one a canvas, so a long animation
  // no longer freezes the tab (both passes are tight loops over every pixel of
  // every frame); on the main thread otherwise, exactly as before.
  const parts =
    (await encodeInWorker(bytes, settings, onProgress)) ??
    (await encodeAnimatedGif(bytes, info, settings, onProgress))
  onProgress(1)
  return { blob: new Blob(parts as BlobPart[], { type: 'image/gif' }), name: withExtension(file.name, 'gif') }
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


function blobOf(writer: GifWriter): Blob {
  return new Blob(writer.finish() as BlobPart[], { type: 'image/gif' })
}

/** Messages the worker posts back. */
export type GifAnimReply =
  | { type: 'progress'; fraction: number }
  | { type: 'done'; parts: Uint8Array[] }
  | { type: 'error'; message: string }

/**
 * Whether a worker can do the job here. The scaler needs a 2D OffscreenCanvas
 * inside the worker, which Safari only grew in 16.4 — asked once, on the main
 * thread, as a stand-in for the worker's own answer.
 */
let workerUsable: boolean | null = null
function canUseWorker(): boolean {
  if (workerUsable !== null) return workerUsable
  try {
    workerUsable =
      typeof Worker !== 'undefined' &&
      typeof OffscreenCanvas !== 'undefined' &&
      new OffscreenCanvas(1, 1).getContext('2d') !== null
  } catch {
    workerUsable = false
  }
  return workerUsable
}

/**
 * `encodeAnimatedGif` in a worker. `null` means "couldn't use one" (no
 * support, or the script failed to load) and the caller runs the same code
 * here instead. A failure INSIDE the encode is a real answer about the file
 * and rejects, exactly as the main-thread path would throw.
 */
function encodeInWorker(
  bytes: Uint8Array,
  settings: ImageSettings,
  onProgress: (fraction: number) => void,
): Promise<Uint8Array[] | null> {
  if (!canUseWorker()) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new GifAnimWorker()
    } catch {
      resolve(null)
      return
    }
    worker.onmessage = (event: MessageEvent<GifAnimReply>) => {
      const reply = event.data
      if (reply.type === 'progress') {
        onProgress(reply.fraction)
        return
      }
      worker.terminate()
      if (reply.type === 'done') resolve(reply.parts)
      else reject(new Error(reply.message))
    }
    // The worker posts every failure of its own as 'error', so an error EVENT
    // means the script never ran: fall back rather than fail.
    worker.onerror = (event) => {
      event.preventDefault()
      worker.terminate()
      resolve(null)
    }
    // Copied, not transferred: `bytes` is kept for the fallback.
    worker.postMessage({ bytes, settings })
  })
}
