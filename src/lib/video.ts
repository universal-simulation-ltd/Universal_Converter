// Video conversion: demux with mp4read.ts, decode and re-encode with the
// browser's own WebCodecs, mux with mp4mux.ts.
//
// This is the same bargain the audio side struck for Opus and M4A — the codec
// is the browser's, the container is ours — which is why video ships without
// the GPL ffmpeg core and the app stays MIT. The cost is honesty about inputs:
// only what this reader can take apart is accepted, and MKV/AVI are refused on
// drop rather than failing half way through.
//
// The audio track takes a deliberate shortcut. Rather than decode AAC through
// WebCodecs, the original file goes to `decodeAudioData`, which reads the audio
// track of an MP4 directly — so trimming, resampling and re-channelling are the
// same `OfflineAudioContext` render the audio tab already uses.

import { encodeAacFrames } from './aac'
import { targetFrameSize, videoBitrate } from './framesize'
import { trimWindow } from './convert'
import { withExtension } from './humanise'
import { UnreadableVideoError, readMp4, type Sample, type Track } from './mp4read'
import { TIMESCALE, buildMp4Movie, type VideoSample } from './mp4mux'
import type { ConvertedFile, VideoSettings } from './types'

export { UnreadableVideoError }
export { targetFrameSize, videoBitrate } from './framesize'

/** AAC-LC codes one frame per 1024 samples. */
const SAMPLES_PER_FRAME = 1024

/**
 * The codec string offered to the encoder. Profile is High throughout — every
 * player that matters has handled it for a decade — with the level stepped up
 * by frame size, because a level too low is a hard configure() failure.
 */
function avcCodec(width: number, height: number): string {
  const pixels = width * height
  if (pixels <= 1280 * 720) return 'avc1.64001f'   // High 3.1
  if (pixels <= 1920 * 1080) return 'avc1.640028'  // High 4.0
  if (pixels <= 2560 * 1440) return 'avc1.640032'  // High 5.0
  return 'avc1.640033'                             // High 5.1
}

/** Whether this browser can decode and re-encode H.264 at all. */
export async function videoSupported(): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return false
  try {
    const { supported } = await VideoEncoder.isConfigSupported({
      codec: avcCodec(1280, 720),
      width: 1280,
      height: 720,
      bitrate: 2_000_000,
      // Length-prefixed AVCC, not Annex B — the only form an MP4 sample table
      // can describe, and the form that yields an avcC in the metadata.
      avc: { format: 'avc' },
    })
    return supported === true
  } catch {
    return false
  }
}

export async function convertVideo(
  file: File,
  settings: VideoSettings,
  onProgress: (fraction: number) => void = () => {},
): Promise<ConvertedFile> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') {
    throw new Error('This browser has no WebCodecs video encoder, so video can’t be converted here — Chrome and Edge do')
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  onProgress(0.02)

  const tracks = readMp4(bytes)
  const source = tracks.find((t) => t.kind === 'video')
  if (!source) {
    throw new UnreadableVideoError('There’s no video track in this file — try the audio tab instead')
  }
  if (!source.description) {
    throw new UnreadableVideoError(
      `This video’s codec (${source.codec}) has no configuration record this converter understands — H.264 is what works today`,
    )
  }
  if (source.samples.length === 0) {
    throw new UnreadableVideoError('This video’s frame table is empty, so there’s nothing to convert')
  }

  // Trim against the real track length, and only from a keyframe: a delta frame
  // is meaningless without the frames it was coded against, so the decoder is
  // fed from the keyframe before the cut and the frames ahead of it are dropped
  // after decoding rather than never decoded.
  const trackSeconds = source.duration / source.timescale
  const { offset, duration } = trimWindow(trackSeconds, settings.trim)
  const startUs = Math.round(offset * 1_000_000)
  const endUs = Math.round((offset + duration) * 1_000_000)

  const feed = samplesForWindow(source, startUs, endUs)
  if (feed.length === 0) {
    throw new Error('That trim window doesn’t contain any frames — widen it or check the times')
  }

  const size = targetFrameSize(source.width, source.height, settings.maxHeight)
  const fps = frameRateOf(source)
  const bitrate = videoBitrate(size.width, size.height, fps, settings.quality)

  const encoded = await transcode({
    bytes,
    track: source,
    feed,
    startUs,
    endUs,
    size,
    fps,
    bitrate,
    onProgress: (fraction) => onProgress(0.05 + fraction * 0.75),
  })

  let audio = null
  if (settings.keepAudio) {
    audio = await encodeAudioTrack(file, settings, (fraction) => onProgress(0.8 + fraction * 0.17))
  }

  const movie = buildMp4Movie({
    video: {
      samples: encoded.samples,
      description: encoded.description,
      width: size.width,
      height: size.height,
    },
    audio,
  })
  onProgress(1)

  return {
    blob: new Blob([movie as BlobPart], { type: 'video/mp4' }),
    name: withExtension(file.name, 'mp4'),
  }
}

/**
 * The samples to hand the decoder for a trim window: everything from the last
 * keyframe at or before the start, up to the end. Returns the whole table when
 * no trim is set.
 */
function samplesForWindow(track: Track, startUs: number, endUs: number): Sample[] {
  const toUs = (ticks: number) => (ticks / track.timescale) * 1_000_000
  let first = 0
  for (let i = 0; i < track.samples.length; i++) {
    const pts = toUs(track.samples[i].pts)
    if (pts > startUs) break
    if (track.samples[i].sync) first = i
  }
  const out: Sample[] = []
  for (let i = first; i < track.samples.length; i++) {
    if (toUs(track.samples[i].pts) >= endUs) break
    out.push(track.samples[i])
  }
  return out
}

/** Frames per second, averaged over the track — VFR sources get their mean. */
function frameRateOf(track: Track): number {
  const seconds = track.duration / track.timescale
  if (seconds <= 0) return 30
  return Math.min(120, Math.max(1, Math.round(track.samples.length / seconds)))
}

interface TranscodeInput {
  bytes: Uint8Array
  track: Track
  feed: Sample[]
  startUs: number
  endUs: number
  size: { width: number; height: number }
  fps: number
  bitrate: number
  onProgress: (fraction: number) => void
}

/**
 * Decode → (scale) → encode, with both codecs running at once.
 *
 * The decoder is kept a bounded distance ahead of the encoder: VideoFrames hold
 * GPU-backed memory that only `close()` releases, so letting the decoder run
 * free would exhaust the pool on a long clip no matter how much RAM is free.
 */
async function transcode(input: TranscodeInput): Promise<{ samples: VideoSample[]; description: Uint8Array }> {
  const { bytes, track, feed, startUs, endUs, size, fps, bitrate, onProgress } = input

  const chunks: { bytes: Uint8Array; timestamp: number; keyframe: boolean }[] = []
  let description: Uint8Array | null = null
  let failure: Error | null = null

  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      const config = metadata?.decoderConfig?.description
      if (config && !description) description = toBytes(config)
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      chunks.push({ bytes: data, timestamp: chunk.timestamp, keyframe: chunk.type === 'key' })
    },
    error: (err) => { failure = asError(err) },
  })

  encoder.configure({
    codec: avcCodec(size.width, size.height),
    width: size.width,
    height: size.height,
    bitrate,
    framerate: fps,
    // AVCC, so the samples are length-prefixed and an avcC comes back in the
    // metadata. Annex B would need converting before it could be muxed.
    avc: { format: 'avc' },
  })

  // Scaling goes through a canvas because VideoEncoder has no resize of its
  // own. Skipped entirely at native size, which keeps a straight re-encode off
  // the GPU round trip.
  const scaling = size.width !== track.width || size.height !== track.height
  const canvas = scaling ? new OffscreenCanvas(size.width, size.height) : null
  const ctx = canvas ? canvas.getContext('2d', { alpha: false }) : null
  if (canvas && !ctx) throw new Error('This browser wouldn’t give a 2D canvas for scaling')

  let decodedCount = 0
  const decoder = new VideoDecoder({
    output: (frame) => {
      try {
        // Frames before the cut were only decoded so the ones after them could
        // be — they are never encoded.
        if (frame.timestamp < startUs || frame.timestamp >= endUs) return
        const timestamp = frame.timestamp - startUs
        if (ctx && canvas) {
          ctx.drawImage(frame, 0, 0, size.width, size.height)
          const scaled = new VideoFrame(canvas, { timestamp, duration: frame.duration ?? undefined })
          encoder.encode(scaled)
          scaled.close()
        } else {
          const shifted = new VideoFrame(frame, { timestamp, duration: frame.duration ?? undefined })
          encoder.encode(shifted)
          shifted.close()
        }
        decodedCount++
        onProgress(Math.min(0.98, decodedCount / feed.length))
      } catch (err) {
        failure = asError(err)
      } finally {
        frame.close()
      }
    },
    error: (err) => { failure = asError(err) },
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
    decoder.decode(new EncodedVideoChunk({
      type: sample.sync ? 'key' : 'delta',
      timestamp: toUs(sample.pts),
      duration: toUs(sample.duration),
      data: bytes.subarray(sample.offset, sample.offset + sample.size),
    }))
    if (decoder.decodeQueueSize > 12) {
      await new Promise<void>((resolve) => {
        decoder.addEventListener('dequeue', () => resolve(), { once: true })
      })
    }
  }

  if (failure) {
    closeQuietly(decoder, encoder)
    throw failure
  }

  await decoder.flush()
  decoder.close()
  // Flushing a codec that already errored throws "Cannot call 'flush' on a
  // closed codec", which buries the real cause — so surface that first.
  if (failure) { closeQuietly(encoder); throw failure }
  await encoder.flush()
  encoder.close()
  if (failure) throw failure

  if (chunks.length === 0) throw new Error('The video encoder returned no frames')
  if (!description) {
    throw new Error('The video encoder gave no codec configuration, so the file couldn’t be described')
  }

  // Durations come from the gaps between presentation times rather than from
  // the source's table: that makes the written timeline exactly the one the
  // encoder produced, so the composition-offset table stays empty and a
  // variable-frame-rate source keeps its real pacing.
  chunks.sort((a, b) => a.timestamp - b.timestamp)
  const fallback = Math.round(1_000_000 / fps)
  const samples: VideoSample[] = chunks.map((chunk, i) => ({
    bytes: chunk.bytes,
    timestamp: Math.round((chunk.timestamp * TIMESCALE) / 1_000_000),
    duration: i + 1 < chunks.length
      ? Math.max(1, Math.round(((chunks[i + 1].timestamp - chunk.timestamp) * TIMESCALE) / 1_000_000))
      : fallback,
    keyframe: chunk.keyframe,
  }))

  return { samples, description }
}

/**
 * The audio track, taken from the original file rather than the demuxed
 * samples: `decodeAudioData` reads an MP4's audio directly, so the trim and the
 * channel handling are the same offline render the audio tab uses.
 *
 * A video with no audio track, or one this browser can't decode, returns null —
 * a silent output beats a failed conversion.
 */
async function encodeAudioTrack(
  file: File,
  settings: VideoSettings,
  onProgress: (fraction: number) => void,
) {
  let decoded: AudioBuffer
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100)
    decoded = await ctx.decodeAudioData(await file.arrayBuffer())
  } catch {
    return null
  }
  if (decoded.length === 0) return null

  const { offset, duration } = trimWindow(decoded.duration, settings.trim)
  const channels = Math.min(2, decoded.numberOfChannels)
  const render = new OfflineAudioContext(
    channels,
    Math.max(1, Math.ceil(duration * decoded.sampleRate)),
    decoded.sampleRate,
  )
  const node = render.createBufferSource()
  node.buffer = decoded
  node.connect(render.destination)
  node.start(0, offset, duration)
  const rendered = await render.startRendering()

  const planes: Float32Array[] = []
  for (let c = 0; c < rendered.numberOfChannels; c++) planes.push(rendered.getChannelData(c))

  try {
    const frames = await encodeAacFrames(
      planes,
      rendered.sampleRate,
      settings.audioBitrateKbps,
      onProgress,
    )
    return { ...frames, samplesPerFrame: SAMPLES_PER_FRAME }
  } catch {
    // The AAC encoder refusing a bitrate shouldn't lose the picture too.
    return null
  }
}

function toBytes(config: AllowSharedBufferSource): Uint8Array {
  return config instanceof ArrayBuffer
    ? new Uint8Array(config)
    : new Uint8Array(
        (config as ArrayBufferView).buffer,
        (config as ArrayBufferView).byteOffset,
        (config as ArrayBufferView).byteLength,
      )
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

function closeQuietly(...codecs: { close: () => void }[]): void {
  for (const codec of codecs) {
    try { codec.close() } catch { /* already closed by the error path */ }
  }
}
