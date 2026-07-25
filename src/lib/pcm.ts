/**
 * Float32 → Int16 conversion, shared by every encoder here.
 *
 * Clip, then map the way every PCM writer does: negatives scale by 0x8000,
 * positives by 0x7FFF, so full-scale 1.0 lands on 32767 rather than wrapping
 * round to -32768.
 */
export function toInt16(sample: number): number {
  const clipped = sample < -1 ? -1 : sample > 1 ? 1 : sample
  return clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff
}

/** A whole channel at once — what the MP3 encoder wants. */
export function channelToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) out[i] = toInt16(samples[i])
  return out
}
