import { toInt16 } from './pcm.ts'

// A 16-bit PCM WAV writer. Pure — takes de-interleaved Float32 channels and
// returns the bytes — so it is unit-testable outside a browser (see
// scripts/selftest.mjs) and can be reused by the ffmpeg path for its WAV target.

const BYTES_PER_SAMPLE = 2

/**
 * @param channels de-interleaved samples, one Float32Array per channel, all the
 *   same length, nominally in [-1, 1] (values outside are clipped, not scaled).
 * @param sampleRate frames per second, e.g. 44100.
 */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  if (channels.length === 0) throw new Error('encodeWav needs at least one channel')
  const numChannels = channels.length
  const frames = channels[0].length
  const dataBytes = frames * numChannels * BYTES_PER_SAMPLE
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)

  const byteRate = sampleRate * numChannels * BYTES_PER_SAMPLE
  const blockAlign = numChannels * BYTES_PER_SAMPLE

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true) // size of everything after this field
  writeAscii(view, 8, 'WAVE')

  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)            // PCM fmt chunk length
  view.setUint16(20, 1, true)             // format 1 = PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 8 * BYTES_PER_SAMPLE, true)

  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  // Interleave frame-by-frame: L R L R …
  let offset = 44
  for (let frame = 0; frame < frames; frame++) {
    for (let c = 0; c < numChannels; c++) {
      view.setInt16(offset, toInt16(channels[c][frame]), true)
      offset += BYTES_PER_SAMPLE
    }
  }
  return buffer
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

