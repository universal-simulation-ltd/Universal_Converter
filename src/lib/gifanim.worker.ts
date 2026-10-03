/// <reference lib="webworker" />
import { readGifInfo } from './gifdecode'
import { encodeAnimatedGif } from './gifanim'
import type { ImageSettings } from './types'
import type { GifAnimReply } from './imagegif'

// The animated-GIF → GIF re-encode, off the main thread, so the page stays
// live and the progress bar moves while a long animation is rewritten.

declare const self: DedicatedWorkerGlobalScope

function reply(message: GifAnimReply, transfer: Transferable[] = []) {
  self.postMessage(message, transfer)
}

self.onmessage = async (event: MessageEvent<{ bytes: Uint8Array; settings: ImageSettings }>) => {
  const { bytes, settings } = event.data
  try {
    const info = readGifInfo(bytes)
    if (!info || info.frames < 2) throw new Error('This GIF has no animation to convert')
    // Progress at most every 50 ms, not once per frame per pass.
    let last = 0
    const parts = await encodeAnimatedGif(bytes, info, settings, (fraction) => {
      const now = performance.now()
      if (fraction < 1 && now - last < 50) return
      last = now
      reply({ type: 'progress', fraction })
    })
    // Chunks can share a buffer, and a buffer listed twice makes postMessage
    // throw — so each distinct buffer once.
    reply({ type: 'done', parts }, [...new Set(parts.map((p) => p.buffer as ArrayBuffer))])
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
