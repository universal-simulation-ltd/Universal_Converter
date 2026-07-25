import { channelToInt16 } from './pcm.ts'

// MP3 encoding via LAME, compiled to JavaScript (@breezystack/lamejs).
//
// Why not ffmpeg.wasm: the only published @ffmpeg/core build is GPL-2.0-or-later
// (it bundles libx264), which would relicense this app. LAME's JS port is
// LGPL-3.0 — a dependency licence, not a project one — so the app stays MIT, and
// the download is ~100× smaller than the 31 MB core. The GPL question comes back
// for H.264 video in Phase 2; it doesn't need answering for audio.
//
// The encoder is loaded on first use (dynamic import) so it never lands in the
// initial bundle, and encoding is chunked so the progress bar moves and the tab
// keeps painting on long files.

/** LAME's supported CBR rates, narrowed to the ones worth offering. */
export const MP3_BITRATES = [128, 192, 256, 320] as const
export type Mp3Bitrate = (typeof MP3_BITRATES)[number]

// LAME only accepts a fixed set of sample rates. Anything else has to be
// resampled first — the offline render does that (a 96 kHz FLAC silently
// becomes 44.1 kHz rather than failing), and the guard below is the backstop.
export const LAME_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]

/** The rate LAME will accept that's closest to (and no higher than) the source. */
export function nearestLameRate(sampleRate: number): number {
  if (LAME_RATES.includes(sampleRate)) return sampleRate
  const below = LAME_RATES.filter((r) => r < sampleRate)
  return below.length > 0 ? Math.max(...below) : Math.min(...LAME_RATES)
}

/** Samples per encodeBuffer call — ~1152-frame MP3 granules, 1152 × 100. */
const CHUNK = 115200

export type Mp3ProgressFn = (fraction: number) => void

export async function encodeMp3(
  channels: Float32Array[],
  sampleRate: number,
  bitrateKbps: number,
  onProgress: Mp3ProgressFn = () => {},
): Promise<Blob> {
  if (channels.length === 0) throw new Error('encodeMp3 needs at least one channel')
  if (!LAME_RATES.includes(sampleRate)) {
    throw new Error(`MP3 can’t use a ${sampleRate} Hz sample rate — pick 44.1 or 48 kHz`)
  }

  const { Mp3Encoder } = await import('@breezystack/lamejs')

  // LAME takes mono or stereo; more than two channels are downmixed by the
  // offline render before we get here.
  const numChannels = Math.min(2, channels.length)
  const encoder = new Mp3Encoder(numChannels, sampleRate, bitrateKbps)

  const left = channelToInt16(channels[0])
  const right = numChannels === 2 ? channelToInt16(channels[1]) : undefined
  const parts: Uint8Array[] = []

  for (let offset = 0; offset < left.length; offset += CHUNK) {
    const end = Math.min(offset + CHUNK, left.length)
    const block = right
      ? encoder.encodeBuffer(left.subarray(offset, end), right.subarray(offset, end))
      : encoder.encodeBuffer(left.subarray(offset, end))
    if (block.length > 0) parts.push(block)
    onProgress(end / left.length)
    // Yield between chunks so the progress bar actually repaints.
    await Promise.resolve()
  }

  const tail = encoder.flush()
  if (tail.length > 0) parts.push(tail)

  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' })
}
