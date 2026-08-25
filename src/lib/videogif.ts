/**
 * Video → animated GIF: demux with @unisim/media's reader, decode with the
 * browser's own WebCodecs, and write the file with our own encoder (gif.ts).
 *
 * The same bargain the MP4 path struck — the codec is the browser's, the
 * container is ours — with one difference worth knowing: this needs only the
 * H.264 DECODER, never the encoder. A browser that can play an MP4 but not
 * make one can still make a GIF, so the two targets are probed separately and
 * the GIF chip can be live while the MP4 chip is not.
 *
 * ⚠️ It decodes the clip TWICE, deliberately. A GIF has one 256-colour palette
 * for the whole animation, and choosing it well means having seen the whole
 * animation — so the first pass looks at every frame and keeps nothing but a
 * histogram, and the second pass quantises and encodes against the palette that
 * came out of it. The alternative, holding the decoded frames between the two,
 * is 78 MB of live pixels for ten seconds at 480×270 and considerably more for
 * anything longer. Decoding is hardware-accelerated and cheap; memory that a
 * phone does not have is not.
 */

import {
  UnreadableVideoError,
  readMp4,
  samplesForWindow,
  trimWindow,
  withExtension,
  type Sample,
  type Track,
} from '@unisim/media'
import { ColourCube, GifWriter, MAX_COLOURS, PaletteMap, quantiseFrame } from './gif'
import { targetSize } from './resize'
import type { ConvertedFile, GifSettings, TrimSettings } from './types'

/**
 * Ceilings, checked before any work starts rather than discovered by a tab
 * running out of memory at 90%.
 *
 * They are not about what a GIF can legally hold — the format has no frame
 * limit — but about what is worth producing: 1200 frames is eighty seconds at
 * 15 fps, and past that the honest answer is "this wants to be a video".
 */
const MAX_FRAMES = 1200
const MAX_PIXELS = 150_000_000

/**
 * Whether this browser can decode H.264 at all — which is all a GIF needs.
 *
 * Deliberately not `videoSupported()` from @unisim/media: that probes the
 * ENCODER, because an MP4 out needs one. Using it here would switch off the GIF
 * chip on a browser that is perfectly capable of producing one.
 */
export async function gifExportSupported(): Promise<boolean> {
  if (typeof VideoDecoder === 'undefined') return false
  try {
    const { supported } = await VideoDecoder.isConfigSupported({
      codec: 'avc1.640028',
      codedWidth: 1280,
      codedHeight: 720,
    })
    return supported === true
  } catch {
    return false
  }
}

/**
 * One video file → one animated GIF.
 *
 * `trim` is passed separately rather than living in `GifSettings` because it is
 * a property of the TAB, not of the target: the trim fields in the panel are
 * the same fields whether MP4 or GIF is selected, and switching between the two
 * must not quietly lose the window somebody typed.
 */
export async function convertVideoToGif(
  file: File,
  settings: GifSettings,
  trim: TrimSettings,
  onProgress: (fraction: number) => void = () => {},
): Promise<ConvertedFile> {
  if (typeof VideoDecoder === 'undefined') {
    throw new Error(
      'This browser has no WebCodecs video decoder, so a GIF can’t be made here — Chrome and Edge have one',
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  onProgress(0.02)

  const track = readMp4(bytes).find((t) => t.kind === 'video')
  if (!track) {
    throw new UnreadableVideoError('There’s no video track in this file — so there’s no picture to animate')
  }
  if (!track.description) {
    throw new UnreadableVideoError(
      `This video’s codec (${track.codec}) has no configuration record this converter understands — H.264 is what works today`,
    )
  }
  if (track.samples.length === 0) {
    throw new UnreadableVideoError('This video’s frame table is empty, so there’s nothing to convert')
  }

  const trackSeconds = track.duration / track.timescale
  const { offset, duration } = trimWindow(trackSeconds, trim)
  const startUs = Math.round(offset * 1_000_000)
  const endUs = Math.round((offset + duration) * 1_000_000)

  const feed = samplesForWindow(track, startUs, endUs)
  if (feed.length === 0) {
    throw new Error('That trim window doesn’t contain any frames — widen it or check the times')
  }

  const size = targetSize(track.width, track.height, settings.maxEdge)
  const stepUs = 1_000_000 / settings.fps

  // A cheap upper bound first, so an hour-long film is refused in a moment
  // rather than after a full decode pass. The exact count is checked again
  // below, once the first pass has actually counted them.
  refuseIfTooBig(Math.ceil(duration * settings.fps), size, settings)

  // ── Pass one: what colours are in this clip? ───────────────────────────────
  const cube = new ColourCube()
  const times: number[] = []
  await eachSampledFrame(
    { bytes, track, feed, startUs, endUs, stepUs, size },
    (pixels, timestampUs) => {
      cube.addFrame(pixels.data)
      times.push(timestampUs)
    },
    (fraction) => onProgress(0.02 + fraction * 0.43),
  )

  if (times.length === 0) {
    throw new Error('No frames came out of that clip — the trim window may fall between frames')
  }
  refuseIfTooBig(times.length, size, settings)

  const colours = cube.palette(MAX_COLOURS)
  const map = new PaletteMap(colours)
  onProgress(0.48)

  // ── Pass two: quantise and write ──────────────────────────────────────────
  const writer = new GifWriter(size.width, size.height, colours, settings.loop)

  // Each frame is held back one step, because its delay is the distance to the
  // frame AFTER it — which is only known once that frame arrives. Times come
  // from the source rather than from 1/fps: at 15 fps a delay is 6.67
  // hundredths, and a GIF can only say 6 or 7. Rounding the running position
  // rather than each gap means the errors cancel instead of accumulating, so a
  // thirty-second clip is still thirty seconds long at the end of it.
  let pending: Uint8Array | null = null
  let pendingCs = 0
  let written = 0
  const nominalCs = Math.max(2, Math.round(100 / settings.fps))

  await eachSampledFrame(
    { bytes, track, feed, startUs, endUs, stepUs, size },
    (pixels, timestampUs) => {
      const indices = quantiseFrame(pixels.data, size.width, size.height, map, settings.dither)
      const cs = Math.round((timestampUs - startUs) / 10_000)
      if (pending) {
        writer.addFrame(pending, cs - pendingCs)
        written++
      }
      pending = indices
      pendingCs = cs
    },
    (fraction) => onProgress(0.48 + fraction * 0.5),
  )

  if (pending) {
    // The last frame has no successor to measure against, so it gets the frame
    // rate's nominal hold.
    writer.addFrame(pending, nominalCs)
    written++
  }
  if (written === 0) throw new Error('No frames came out of that clip — try widening the trim')

  onProgress(1)
  return {
    blob: new Blob(writer.finish() as BlobPart[], { type: 'image/gif' }),
    name: withExtension(file.name, 'gif'),
  }
}

function refuseIfTooBig(
  frames: number,
  size: { width: number; height: number },
  settings: GifSettings,
): void {
  const pixels = frames * size.width * size.height
  if (frames <= MAX_FRAMES && pixels <= MAX_PIXELS) return
  const seconds = Math.round(frames / settings.fps)
  throw new Error(
    `That’s ${frames} frames at ${size.width}×${size.height} — about ${seconds} seconds, which is more GIF than a browser can build. ` +
      'Trim it shorter, choose a smaller size, or drop the frame rate.',
  )
}

interface PassInput {
  bytes: Uint8Array
  track: Track
  feed: Sample[]
  startUs: number
  endUs: number
  /** The gap between the frames we keep — the source's own rate is usually finer. */
  stepUs: number
  size: { width: number; height: number }
}

/**
 * Decode the window and hand back the frames that land on the GIF's timetable,
 * already drawn at the output size.
 *
 * Both passes go through here, with the same inputs, so they select exactly the
 * same frames — which is what lets the second pass trust the palette the first
 * one built.
 */
async function eachSampledFrame(
  input: PassInput,
  onFrame: (pixels: ImageData, timestampUs: number) => void,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const { bytes, track, feed, startUs, endUs, stepUs, size } = input

  const canvas = new OffscreenCanvas(size.width, size.height)
  // `willReadFrequently` matters here more than anywhere else in this app: every
  // single frame is read straight back out with getImageData, and without the
  // hint some browsers keep the canvas on the GPU and pay a full readback each
  // time.
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (!ctx) throw new Error('This browser wouldn’t give a 2D canvas to draw the frames on')

  let failure: Error | null = null
  let seen = 0
  let nextWantedUs = startUs
  let lastKeptUs = -Infinity

  const decoder = new VideoDecoder({
    output: (frame) => {
      try {
        const timestamp = frame.timestamp
        // Frames before the cut were decoded only so the ones after them could
        // be — and a decoder is fed past the end of the window on purpose (see
        // `samplesForWindow`), so both ends are filtered here rather than there.
        if (timestamp < startUs || timestamp >= endUs) return
        // ⚠️ Defensive: WebCodecs is specified to emit frames in presentation
        // order, but the delay arithmetic downstream subtracts consecutive
        // timestamps, and a single frame out of order would turn one delay
        // negative and the next one enormous. Cheaper to refuse it here than to
        // debug a GIF that stutters once, in the middle.
        if (timestamp <= lastKeptUs) return
        if (timestamp < nextWantedUs) return

        lastKeptUs = timestamp
        nextWantedUs += stepUs
        // A source with a gap in it — a still held for two seconds — must not
        // leave the timetable behind, or every frame after the gap is kept
        // while it catches up.
        if (nextWantedUs <= timestamp) nextWantedUs = timestamp + stepUs

        ctx.drawImage(frame, 0, 0, size.width, size.height)
        onFrame(ctx.getImageData(0, 0, size.width, size.height), timestamp)
      } catch (err) {
        failure = asError(err)
      } finally {
        frame.close()
        seen++
        onProgress(Math.min(1, seen / feed.length))
      }
    },
    error: (err) => {
      failure = asError(err)
    },
  })

  decoder.configure({
    codec: track.codec,
    description: track.description ?? undefined,
    codedWidth: track.width,
    codedHeight: track.height,
  })

  const toUs = (ticks: number) => Math.round((ticks / track.timescale) * 1_000_000)

  for (const sample of feed) {
    if (failure) break
    decoder.decode(
      new EncodedVideoChunk({
        type: sample.sync ? 'key' : 'delta',
        timestamp: toUs(sample.pts),
        duration: toUs(sample.duration),
        data: bytes.subarray(sample.offset, sample.offset + sample.size),
      }),
    )
    // VideoFrames hold GPU-backed memory that only close() releases, so the
    // decoder is kept on a short lead however much RAM is going spare.
    if (decoder.decodeQueueSize > 12) {
      await new Promise<void>((resolve) => {
        decoder.addEventListener('dequeue', () => resolve(), { once: true })
      })
    }
  }

  if (failure) {
    try {
      decoder.close()
    } catch {
      /* already closed by the error path */
    }
    throw failure
  }

  await decoder.flush()
  decoder.close()
  if (failure) throw failure
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}
