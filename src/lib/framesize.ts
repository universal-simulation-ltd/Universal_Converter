// The sizing maths behind a video conversion — what frame size to encode at,
// and what bitrate that size deserves. Pure, and kept out of video.ts for the
// same reason resize.ts is kept out of image.ts: the arithmetic is where the
// mistakes live, and it's testable without a browser.

import type { VideoSettings } from './types.ts'

/**
 * Bits per pixel per frame for each quality step, which is what actually sets
 * the bitrate: a 4K frame needs eight times a 720p frame's budget to look the
 * same, so a flat "5 Mbps" would be lavish on one and starvation on the other.
 */
const BITS_PER_PIXEL: Record<VideoSettings['quality'], number> = {
  high: 0.14,
  balanced: 0.08,
  small: 0.045,
}

export function videoBitrate(
  width: number,
  height: number,
  fps: number,
  quality: VideoSettings['quality'],
): number {
  const raw = width * height * fps * BITS_PER_PIXEL[quality]
  // Floor and ceiling keep a postage-stamp clip watchable and stop a 4K/60
  // source asking for a bitrate no browser encoder will accept.
  return Math.round(Math.min(Math.max(raw, 200_000), 60_000_000))
}

/**
 * The encoded size, keeping the source's aspect ratio and capping the *height*
 * — "1080p" names a height, and a phone video held upright should come out
 * 1080 wide, not 1080 tall.
 *
 * H.264 codes in 16×16 macroblocks and several encoders refuse odd dimensions,
 * so both edges land on an even number.
 */
export function targetFrameSize(
  width: number,
  height: number,
  maxHeight: VideoSettings['maxHeight'],
): { width: number; height: number } {
  const shortEdge = Math.min(width, height)
  if (maxHeight === 'source' || shortEdge <= maxHeight) {
    return { width: even(width), height: even(height) }
  }
  const scale = maxHeight / shortEdge
  return { width: even(width * scale), height: even(height * scale) }
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2)
}
