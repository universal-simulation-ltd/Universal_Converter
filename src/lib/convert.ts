import { encodeAiff } from './aiff'
import { audioFormatMeta } from './formats'
import { withExtension } from './humanise'
import { encodeMp3, nearestLameRate } from './mp3'
import type { AudioSettings, ConvertedFile } from './types'
import { encodeWav } from './wav'

/**
 * Thrown when the chosen target needs the ffmpeg.wasm core, which isn't wired
 * up. The UI disables those chips, so this is a backstop rather than something
 * a user should be able to reach.
 */
export class EngineUnavailableError extends Error {
  constructor(format: string) {
    super(`${format.toUpperCase()} output needs the ffmpeg engine, which isn’t available yet`)
    this.name = 'EngineUnavailableError'
  }
}

/**
 * Files above this size are flagged in the queue before anyone presses Convert.
 * Browser conversion runs in a 32-bit address space (~2 GB ceiling) and decoding
 * to float PCM costs roughly 10× the encoded size, so a large input can fail
 * outright — better to say so up front than half way through.
 */
export const LARGE_FILE_BYTES = 250 * 1024 * 1024

export type ProgressFn = (fraction: number) => void

/**
 * Convert one audio file to `settings.format`.
 *
 * Decoding, resampling, re-channelling and normalising all happen in one
 * offline render; the encoder is chosen per target. WAV and AIFF are our own
 * writers, MP3 is LAME-in-JS (dynamically imported), and the compressed targets
 * route to ffmpeg.wasm — the single seam where that plugs in.
 */
export async function convertAudio(
  file: File,
  settings: AudioSettings,
  onProgress: ProgressFn = () => {},
): Promise<ConvertedFile> {
  const meta = audioFormatMeta(settings.format)
  if (meta.engine === 'ffmpeg') throw new EngineUnavailableError(settings.format)

  const bytes = await file.arrayBuffer()
  onProgress(0.08)

  const decoded = await decode(bytes)
  onProgress(0.3)

  const rendered = await render(decoded, settings)
  onProgress(0.5)

  const channels: Float32Array[] = []
  for (let c = 0; c < rendered.numberOfChannels; c++) channels.push(rendered.getChannelData(c))

  const name = withExtension(file.name, meta.ext)

  if (settings.format === 'mp3') {
    // Encoding dominates the wall-clock here, so the second half of the bar is
    // all LAME's.
    const blob = await encodeMp3(channels, rendered.sampleRate, settings.bitrateKbps, (fraction) =>
      onProgress(0.5 + fraction * 0.5),
    )
    return { blob, name }
  }

  const bytesOut =
    settings.format === 'aiff'
      ? encodeAiff(channels, rendered.sampleRate)
      : encodeWav(channels, rendered.sampleRate)
  onProgress(1)
  return { blob: new Blob([bytesOut], { type: meta.mime }), name }
}

// A throwaway context purely for decoding — its own rate doesn't affect the
// decoded buffer, which keeps the file's native sample rate.
async function decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, 1, 44100)
  try {
    return await ctx.decodeAudioData(bytes)
  } catch {
    throw new Error('This file couldn’t be decoded — it may be corrupt or use a codec this browser can’t read')
  }
}

// Resample, re-channel and (optionally) normalise in one offline render. The
// destination's channel count does the up/down mix, so mono→stereo and
// stereo→mono both come for free.
async function render(decoded: AudioBuffer, settings: AudioSettings): Promise<AudioBuffer> {
  const requested = settings.sampleRate === 'source' ? decoded.sampleRate : settings.sampleRate
  // LAME accepts a fixed set of rates, so a 96 kHz source resamples on the way
  // in rather than failing at the encoder.
  const sampleRate = settings.format === 'mp3' ? nearestLameRate(requested) : requested
  const channelCount =
    settings.channels === 'source' ? decoded.numberOfChannels : settings.channels === 'mono' ? 1 : 2
  const frames = Math.max(1, Math.ceil(decoded.duration * sampleRate))

  const ctx = new OfflineAudioContext(channelCount, frames, sampleRate)
  const source = ctx.createBufferSource()
  source.buffer = decoded

  const gain = ctx.createGain()
  gain.gain.value = settings.normalise ? normaliseGain(decoded) : 1

  source.connect(gain)
  gain.connect(ctx.destination)
  source.start()
  return ctx.startRendering()
}

// Peak normalisation to -0.2 dBFS. Capped at 12 dB of lift so a near-silent
// recording doesn't come back as a wall of hiss.
const MAX_GAIN = 4
function normaliseGain(buffer: AudioBuffer): number {
  let peak = 0
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i])
      if (abs > peak) peak = abs
    }
  }
  if (peak === 0) return 1
  return Math.min(MAX_GAIN, 0.977 / peak)
}
