import { encodeAiff } from './aiff'
import { audioFormatMeta } from './formats'
import { formatDuration, withExtension } from './humanise'
import { encodeMp3, nearestLameRate } from './mp3'
import { encodeAac } from './aac'
import { encodeFlac } from './flac'
import { OPUS_SAMPLE_RATE, encodeOpus } from './opus'
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

  if (settings.format === 'opus') {
    const blob = await encodeOpus(channels, rendered.sampleRate, settings.bitrateKbps, (fraction) =>
      onProgress(0.5 + fraction * 0.5),
    )
    return { blob, name }
  }

  if (settings.format === 'flac') {
    const blob = await encodeFlac(channels, rendered.sampleRate, (fraction) =>
      onProgress(0.5 + fraction * 0.5),
    )
    return { blob, name }
  }

  if (settings.format === 'm4a') {
    const blob = await encodeAac(channels, rendered.sampleRate, settings.bitrateKbps, (fraction) =>
      onProgress(0.5 + fraction * 0.5),
    )
    return { blob, name }
  }

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
  const sampleRate =
    settings.format === 'mp3'
      ? nearestLameRate(requested)
      : // Opus is a 48 kHz codec; resample rather than refuse the file.
        settings.format === 'opus'
        ? OPUS_SAMPLE_RATE
        : requested
  const channelCount =
    settings.channels === 'source' ? decoded.numberOfChannels : settings.channels === 'mono' ? 1 : 2

  const { offset, duration } = trimWindow(decoded.duration, settings.trim)
  const frames = Math.max(1, Math.ceil(duration * sampleRate))

  const ctx = new OfflineAudioContext(channelCount, frames, sampleRate)
  const source = ctx.createBufferSource()
  source.buffer = decoded

  const gain = ctx.createGain()
  gain.gain.value = settings.normalise ? normaliseGain(decoded) : 1

  source.connect(gain)
  gain.connect(ctx.destination)
  // start(when, offset, duration) does the trim inside the render — no separate
  // pass, and nothing outside the window is ever encoded.
  source.start(0, offset, duration)
  return ctx.startRendering()
}

/**
 * Resolve the trim settings against one file's real length. Exported so the
 * failure cases are testable: a start past the end of the file, or an end at or
 * before the start, are user errors that deserve a sentence rather than a
 * zero-length file.
 */
export function trimWindow(
  fileDuration: number,
  trim: AudioSettings['trim'],
): { offset: number; duration: number } {
  if (!trim.enabled) return { offset: 0, duration: fileDuration }

  const offset = Math.max(0, trim.startSec)
  if (offset >= fileDuration) {
    throw new Error(
      `This file is only ${formatDuration(fileDuration)} long, so a trim starting at ${formatDuration(offset)} leaves nothing`,
    )
  }

  const end = trim.endSec == null ? fileDuration : Math.min(trim.endSec, fileDuration)
  if (end <= offset) {
    throw new Error('The trim ends before it starts — check the start and end times')
  }
  return { offset, duration: end - offset }
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
