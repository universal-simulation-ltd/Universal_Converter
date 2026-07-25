import { toInt16 } from './pcm.ts'

// A 16-bit PCM AIFF writer — Apple's counterpart to WAV. Pure, like the WAV
// writer, so it's unit-testable outside a browser (scripts/selftest.mjs checks
// the output with macOS `afinfo`).
//
// AIFF is big-endian throughout, and stores the sample rate as an 80-bit IEEE
// 754 extended float, which is the only fiddly part (see writeExtended).

const BYTES_PER_SAMPLE = 2

export function encodeAiff(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  if (channels.length === 0) throw new Error('encodeAiff needs at least one channel')
  const numChannels = channels.length
  const frames = channels[0].length
  const soundBytes = frames * numChannels * BYTES_PER_SAMPLE

  // FORM header (12) + COMM chunk (8 + 18) + SSND chunk (8 + 8 + audio)
  const buffer = new ArrayBuffer(12 + 26 + 16 + soundBytes)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'FORM')
  view.setUint32(4, buffer.byteLength - 8) // big-endian: everything after this field
  writeAscii(view, 8, 'AIFF')

  writeAscii(view, 12, 'COMM')
  view.setUint32(16, 18)                    // COMM chunk length
  view.setUint16(20, numChannels)
  view.setUint32(22, frames)                // frames per channel
  view.setUint16(26, 8 * BYTES_PER_SAMPLE)  // bit depth
  writeExtended(view, 28, sampleRate)       // 80-bit extended float, 10 bytes

  writeAscii(view, 38, 'SSND')
  view.setUint32(42, soundBytes + 8)
  view.setUint32(46, 0)                     // offset
  view.setUint32(50, 0)                     // block size

  // Interleaved, big-endian.
  let offset = 54
  for (let frame = 0; frame < frames; frame++) {
    for (let c = 0; c < numChannels; c++) {
      view.setInt16(offset, toInt16(channels[c][frame]))
      offset += BYTES_PER_SAMPLE
    }
  }
  return buffer
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

// 80-bit IEEE 754 extended: 1 sign bit, 15 exponent bits (bias 16383), then a
// 64-bit mantissa WITH an explicit leading 1 (unlike the 32/64-bit formats,
// where it's implied). Sample rates are positive integers well inside the
// range, so the sign bit is always 0 and no rounding is needed.
function writeExtended(view: DataView, offset: number, value: number): void {
  if (value <= 0) {
    for (let i = 0; i < 10; i++) view.setUint8(offset + i, 0)
    return
  }
  const exponent = Math.floor(Math.log2(value))
  // Scale so the mantissa's top bit (bit 63) is the leading 1.
  const mantissa = value / Math.pow(2, exponent) * Math.pow(2, 63)
  view.setUint16(offset, exponent + 16383)
  const high = Math.floor(mantissa / 0x100000000)
  view.setUint32(offset + 2, high)
  view.setUint32(offset + 6, mantissa - high * 0x100000000)
}
