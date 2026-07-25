import { formatMeta } from './formats'
import { withExtension } from './humanise'
import type { ConvertedFile, OutputSettings } from './types'
import { encodeWav } from './wav'

/**
 * Thrown when the chosen target needs the ffmpeg.wasm core, which isn't wired
 * up yet. The UI disables those chips, so this is a backstop rather than
 * something a user should be able to reach.
 */
export class EngineUnavailableError extends Error {
  constructor(format: string) {
    super(`${format.toUpperCase()} output needs the conversion engine, which isn’t available yet`)
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
 * Convert one file to `settings.format`.
 *
 * Phase 1 covers the WAV target using the browser's own decoder — no download,
 * offline from the first visit. Every other target routes to ffmpeg.wasm, which
 * lands next; this function is the single seam where that plugs in.
 */
export async function convertFile(
  file: File,
  settings: OutputSettings,
  onProgress: ProgressFn = () => {},
): Promise<ConvertedFile> {
  const meta = formatMeta(settings.format)
  if (meta.engine === 'ffmpeg') throw new EngineUnavailableError(settings.format)

  const bytes = await file.arrayBuffer()
  onProgress(0.1)

  const decoded = await decode(bytes)
  onProgress(0.45)

  const rendered = await render(decoded, settings)
  onProgress(0.8)

  const channels: Float32Array[] = []
  for (let c = 0; c < rendered.numberOfChannels; c++) channels.push(rendered.getChannelData(c))
  const wav = encodeWav(channels, rendered.sampleRate)
  onProgress(1)

  return {
    blob: new Blob([wav], { type: meta.mime }),
    name: withExtension(file.name, meta.ext),
  }
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
async function render(decoded: AudioBuffer, settings: OutputSettings): Promise<AudioBuffer> {
  const sampleRate = settings.sampleRate === 'source' ? decoded.sampleRate : settings.sampleRate
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
