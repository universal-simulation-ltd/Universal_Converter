import { HEADER_BOS, HEADER_EOS, buildPage, opusHead, opusTags } from './ogg'

// Opus encoding with **no library at all**: the browser's own WebCodecs
// `AudioEncoder` produces the packets, and ogg.ts wraps them in the container.
// That sidesteps the ffmpeg licence question entirely for this format — there is
// no third-party codec involved, just the one already in the browser.
//
// Support varies (Chrome yes, others check at runtime), so `opusSupported()`
// gates the chip the same way AVIF is gated on the images side.

/** Opus always runs at 48 kHz internally; anything else has to be resampled in. */
export const OPUS_SAMPLE_RATE = 48000

/**
 * libopus's default encoder lookahead, in 48 kHz samples. It's the number of
 * leading samples a decoder must discard to line the output back up with the
 * input, and it goes in the OpusHead. 312 is libopus's default (6.5 ms) and what
 * Chrome's encoder uses; a wrong value here shifts playback by a few
 * milliseconds rather than breaking the file.
 */
const PRE_SKIP = 312

/** 20 ms of audio per encoder frame — Opus's most common frame size. */
const FRAME_SAMPLES = 960

// Ogg pages cap at 255 segments; a page is also flushed once it's carrying a
// reasonable amount, so a reader never has to buffer much before it can play.
const MAX_SEGMENTS_PER_PAGE = 250
const MAX_PAGE_BYTES = 48_000

let supportCache: Promise<boolean> | null = null

export function opusSupported(): Promise<boolean> {
  if (supportCache) return supportCache
  supportCache = (async () => {
    if (typeof AudioEncoder === 'undefined') return false
    try {
      const result = await AudioEncoder.isConfigSupported({
        codec: 'opus',
        sampleRate: OPUS_SAMPLE_RATE,
        numberOfChannels: 2,
        bitrate: 128_000,
      })
      return result.supported === true
    } catch {
      return false
    }
  })()
  return supportCache
}

export async function encodeOpus(
  channels: Float32Array[],
  sampleRate: number,
  bitrateKbps: number,
  onProgress: (fraction: number) => void = () => {},
  comments: string[] = [],
): Promise<Blob> {
  if (sampleRate !== OPUS_SAMPLE_RATE) {
    throw new Error(`Opus needs 48 kHz audio — got ${sampleRate}`)
  }
  if (!(await opusSupported())) {
    throw new Error('This browser can’t encode Opus — try MP3, WAV or AIFF')
  }

  const numberOfChannels = Math.min(2, channels.length)
  const totalFrames = channels[0].length
  const packets: Uint8Array[] = []

  let encoderError: Error | null = null
  const encoder = new AudioEncoder({
    output: (chunk) => {
      const bytes = new Uint8Array(chunk.byteLength)
      chunk.copyTo(bytes)
      packets.push(bytes)
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err))
    },
  })

  encoder.configure({
    codec: 'opus',
    sampleRate: OPUS_SAMPLE_RATE,
    numberOfChannels,
    bitrate: bitrateKbps * 1000,
  })

  // WebCodecs takes planar float: every channel's samples end to end, in one
  // buffer, per frame of audio.
  for (let offset = 0; offset < totalFrames; offset += FRAME_SAMPLES) {
    if (encoderError) break
    const count = Math.min(FRAME_SAMPLES, totalFrames - offset)
    const planar = new Float32Array(count * numberOfChannels)
    for (let c = 0; c < numberOfChannels; c++) {
      planar.set(channels[c].subarray(offset, offset + count), c * count)
    }
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: OPUS_SAMPLE_RATE,
      numberOfFrames: count,
      numberOfChannels,
      timestamp: Math.round((offset / OPUS_SAMPLE_RATE) * 1_000_000),
      data: planar,
    })
    encoder.encode(data)
    data.close()

    onProgress((offset + count) / totalFrames * 0.9)
    // Let the encoder drain rather than queueing the whole file at once.
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
  if (packets.length === 0) throw new Error('The Opus encoder returned nothing')

  onProgress(0.95)
  const blob = mux(packets, numberOfChannels, sampleRate, totalFrames, comments)
  onProgress(1)
  return blob
}

// Wrap the packets in Ogg: OpusHead on its own beginning-of-stream page,
// OpusTags on the next, then the audio, batched into pages.
function mux(packets: Uint8Array[], channels: number, inputRate: number, totalFrames: number, comments: string[]): Blob {
  const serial = 0x554e4943 // "UNIC" — any value works; it names this one stream
  const pages: Uint8Array[] = []
  let sequence = 0

  pages.push(buildPage({
    packets: [opusHead(channels, PRE_SKIP, inputRate)],
    granulePosition: 0,
    serial,
    sequence: sequence++,
    headerType: HEADER_BOS,
  }))

  pages.push(buildPage({
    packets: [opusTags('UNI·SIM Universal Converter', comments)],
    granulePosition: 0,
    serial,
    sequence: sequence++,
    headerType: 0,
  }))

  // Granule position counts decodable samples at 48 kHz, including the pre-skip,
  // so the final page's value is what a player reports as the duration.
  const finalGranule = totalFrames + PRE_SKIP
  let batch: Uint8Array[] = []
  let batchSegments = 0
  let batchBytes = 0
  let packetsWritten = 0

  const flushBatch = (isLast: boolean) => {
    if (batch.length === 0) return
    packetsWritten += batch.length
    const granule = isLast
      ? finalGranule
      : Math.min(finalGranule, packetsWritten * FRAME_SAMPLES + PRE_SKIP)
    pages.push(buildPage({
      packets: batch,
      granulePosition: granule,
      serial,
      sequence: sequence++,
      headerType: isLast ? HEADER_EOS : 0,
    }))
    batch = []
    batchSegments = 0
    batchBytes = 0
  }

  for (let i = 0; i < packets.length; i++) {
    const packet = packets[i]
    const segments = Math.floor(packet.length / 255) + 1
    if (batch.length > 0 && (batchSegments + segments > MAX_SEGMENTS_PER_PAGE || batchBytes + packet.length > MAX_PAGE_BYTES)) {
      flushBatch(false)
    }
    batch.push(packet)
    batchSegments += segments
    batchBytes += packet.length
    if (i === packets.length - 1) flushBatch(true)
  }

  return new Blob(pages as BlobPart[], { type: 'audio/ogg' })
}
