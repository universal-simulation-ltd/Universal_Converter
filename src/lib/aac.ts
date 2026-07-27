import { buildMp4 } from './mp4'

// M4A output: AAC frames from the browser's own WebCodecs `AudioEncoder`, wrapped
// by mp4.ts. Like Opus, there is no third-party codec in the path — so the format
// people most often want from an Apple machine doesn't wait on the ffmpeg licence
// decision either.
//
// Support varies by browser (and, on some platforms, by what the OS provides),
// so `aacSupported()` gates the chip at runtime.

/** AAC-LC codes one frame per 1024 samples. */
const SAMPLES_PER_FRAME = 1024

/**
 * AAC encoders emit priming ("encoder delay") samples before real audio starts.
 * 2112 is the near-universal value for AAC-LC and what Apple's own tooling
 * assumes; it's written into an edit list so players skip it instead of opening
 * with a blip of silence. A wrong value here costs a few milliseconds at the
 * head, not a broken file.
 */
const PRIMING_SAMPLES = 2112

const AAC_CODEC = 'mp4a.40.2'

const trialCache = new Map<string, Promise<boolean>>()

/**
 * Whether this browser will *actually* encode AAC at a given bitrate.
 *
 * `isConfigSupported()` cannot be trusted here: on Chrome/macOS it answers true
 * for every bitrate, and then the encoder fails at runtime for some of them.
 * Observed on Chrome 148/macOS: **exactly 32 kbps per channel fails** — 64 kbps
 * stereo and 32 kbps mono both error, while 48 and 80 stereo are fine. So
 * support is established by encoding one real frame and seeing what happens.
 * Results are cached per configuration; each trial is a single 1024-sample frame.
 */
export function aacSupported(bitrateKbps = 128, channels = 2): Promise<boolean> {
  const key = `${bitrateKbps}/${channels}`
  const cached = trialCache.get(key)
  if (cached) return cached

  const trial = (async () => {
    if (typeof AudioEncoder === 'undefined') return false
    return new Promise<boolean>((resolve) => {
      let failed = false
      let encoder: AudioEncoder
      try {
        encoder = new AudioEncoder({ output: () => {}, error: () => { failed = true } })
        encoder.configure({
          codec: AAC_CODEC,
          sampleRate: 44100,
          numberOfChannels: channels,
          bitrate: bitrateKbps * 1000,
        })
        const planar = new Float32Array(SAMPLES_PER_FRAME * channels)
        encoder.encode(new AudioData({
          format: 'f32-planar',
          sampleRate: 44100,
          numberOfFrames: SAMPLES_PER_FRAME,
          numberOfChannels: channels,
          timestamp: 0,
          data: planar,
        }))
        encoder
          .flush()
          .then(() => {
            try { encoder.close() } catch { /* already closed by the error path */ }
            resolve(!failed)
          })
          .catch(() => resolve(false))
      } catch {
        resolve(false)
      }
    })
  })()

  trialCache.set(key, trial)
  return trial
}

export interface AacFrames {
  frames: Uint8Array[]
  /** AudioSpecificConfig — without it the esds describes nothing. */
  description: Uint8Array
  sampleRate: number
  channels: number
  samplesPerFrame: number
}

/**
 * Encode to raw AAC frames, stopping short of a container.
 *
 * M4A wraps these in an audio-only MP4; the video muxer puts the same frames in
 * a second track alongside the picture. Both want the frames and the
 * AudioSpecificConfig, so the encoding lives here and the wrapping doesn't.
 */
export async function encodeAacFrames(
  channels: Float32Array[],
  sampleRate: number,
  bitrateKbps: number,
  onProgress: (fraction: number) => void = () => {},
): Promise<AacFrames> {
  const numberOfChannels = Math.min(2, channels.length)
  if (!(await aacSupported(bitrateKbps, numberOfChannels))) {
    throw new Error(
      `This browser wouldn’t encode AAC at ${bitrateKbps} kbps — its encoder refuses some bitrates outright. Try 128 kbps.`,
    )
  }

  const totalFrames = channels[0].length
  const frames: Uint8Array[] = []
  let description: Uint8Array | null = null
  let encoderError: Error | null = null

  const encoder = new AudioEncoder({
    output: (chunk, metadata) => {
      // The AudioSpecificConfig arrives once, on the first chunk's metadata, and
      // it's what makes the file decodable — without it the esds box describes
      // nothing and players reject the track.
      const config = metadata?.decoderConfig?.description
      if (config && !description) {
        description = config instanceof ArrayBuffer ? new Uint8Array(config) : new Uint8Array(
          (config as ArrayBufferView).buffer,
          (config as ArrayBufferView).byteOffset,
          (config as ArrayBufferView).byteLength,
        )
      }
      const bytes = new Uint8Array(chunk.byteLength)
      chunk.copyTo(bytes)
      frames.push(bytes)
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err))
    },
  })

  encoder.configure({
    codec: AAC_CODEC,
    sampleRate,
    numberOfChannels,
    bitrate: bitrateKbps * 1000,
  })

  for (let offset = 0; offset < totalFrames; offset += SAMPLES_PER_FRAME) {
    if (encoderError) break
    const count = Math.min(SAMPLES_PER_FRAME, totalFrames - offset)
    const planar = new Float32Array(count * numberOfChannels)
    for (let c = 0; c < numberOfChannels; c++) {
      planar.set(channels[c].subarray(offset, offset + count), c * count)
    }
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: count,
      numberOfChannels,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: planar,
    })
    encoder.encode(data)
    data.close()

    onProgress(((offset + count) / totalFrames) * 0.9)
    if (encoder.encodeQueueSize > 24) {
      await new Promise<void>((resolve) => {
        encoder.addEventListener('dequeue', () => resolve(), { once: true })
      })
    }
  }

  // Flushing a codec that already errored throws "Cannot call 'flush' on a
  // closed codec", which buries the real cause — so surface that first.
  if (encoderError) throw encoderError
  await encoder.flush()
  encoder.close()
  if (frames.length === 0) throw new Error('The AAC encoder returned nothing')
  if (!description) throw new Error('The AAC encoder gave no codec configuration, so the file couldn’t be described')

  onProgress(0.95)
  return {
    frames,
    description,
    sampleRate,
    channels: numberOfChannels,
    samplesPerFrame: SAMPLES_PER_FRAME,
  }
}

export async function encodeAac(
  channels: Float32Array[],
  sampleRate: number,
  bitrateKbps: number,
  onProgress: (fraction: number) => void = () => {},
): Promise<Blob> {
  const encoded = await encodeAacFrames(channels, sampleRate, bitrateKbps, onProgress)
  const mp4 = buildMp4({ ...encoded, priming: PRIMING_SAMPLES })
  onProgress(1)
  return new Blob([mp4 as BlobPart], { type: 'audio/mp4' })
}
