// A minimal Ogg container writer — enough to wrap Opus packets, which is what
// an `.opus` file is. Pure and free of browser APIs so scripts/selftest.mjs can
// check the page structure without a DOM.
//
// One Ogg page is: the "OggS" capture pattern, a header, a segment table that
// describes how the payload splits into packets, then the payload itself. A
// packet is laced into 255-byte segments; a final segment of exactly 255 means
// "continues into the next", so a packet whose length is a multiple of 255 needs
// a trailing zero-length segment or readers will wait for more.

export const HEADER_BOS = 0x02
export const HEADER_EOS = 0x04

export interface PageInput {
  packets: Uint8Array[]
  granulePosition: number
  serial: number
  sequence: number
  headerType: number
}

/** Build one Ogg page. Throws if the packets won't fit — callers must split. */
export function buildPage({ packets, granulePosition, serial, sequence, headerType }: PageInput): Uint8Array {
  const segments: number[] = []
  for (const packet of packets) {
    let remaining = packet.length
    while (remaining >= 255) {
      segments.push(255)
      remaining -= 255
    }
    segments.push(remaining)
  }
  if (segments.length > 255) throw new Error('too many Ogg segments for one page')

  const payloadLength = packets.reduce((sum, p) => sum + p.length, 0)
  const page = new Uint8Array(27 + segments.length + payloadLength)
  const view = new DataView(page.buffer)

  page[0] = 0x4f // O
  page[1] = 0x67 // g
  page[2] = 0x67 // g
  page[3] = 0x53 // S
  page[4] = 0     // stream structure version
  page[5] = headerType

  // Granule position is 64-bit; Opus never needs more than 2^53 samples here, so
  // it's written as a split 32-bit pair rather than pulling in BigInt.
  view.setUint32(6, granulePosition >>> 0, true)
  view.setUint32(10, Math.floor(granulePosition / 0x100000000), true)
  view.setUint32(14, serial, true)
  view.setUint32(18, sequence, true)
  view.setUint32(22, 0, true) // checksum — filled in below, over the whole page
  page[26] = segments.length
  page.set(segments, 27)

  let offset = 27 + segments.length
  for (const packet of packets) {
    page.set(packet, offset)
    offset += packet.length
  }

  view.setUint32(22, oggCrc(page), true)
  return page
}

/**
 * Ogg's CRC-32 is not the common one: polynomial 0x04C11DB7 with **no** input or
 * output reflection and no final XOR. Using the ZIP/PNG variant here produces
 * pages every demuxer rejects, which is a miserable thing to debug — hence its
 * own implementation rather than sharing zip.ts's.
 */
const OGG_CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let bit = 0; bit < 8; bit++) {
      r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0
    }
    table[i] = r >>> 0
  }
  return table
})()

export function oggCrc(bytes: Uint8Array): number {
  let crc = 0
  for (let i = 0; i < bytes.length; i++) {
    crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) & 0xff) ^ bytes[i]]) >>> 0
  }
  return crc >>> 0
}

/** The `OpusHead` identification packet — the first packet of every .opus file. */
export function opusHead(channels: number, preSkip: number, inputSampleRate: number): Uint8Array {
  const head = new Uint8Array(19)
  const view = new DataView(head.buffer)
  head.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0) // "OpusHead"
  head[8] = 1                       // version
  head[9] = channels
  view.setUint16(10, preSkip, true)
  view.setUint32(12, inputSampleRate, true)
  view.setInt16(16, 0, true)        // output gain
  head[18] = 0                      // channel mapping family 0 (mono/stereo)
  return head
}

/**
 * The `OpusTags` comment packet — required, even when it carries no comments.
 * `comments` are Vorbis-style `KEY=value` strings.
 */
export function opusTags(vendor: string, comments: string[] = []): Uint8Array {
  const encoder = new TextEncoder()
  const vendorBytes = encoder.encode(vendor)
  const entries = comments.map((c) => encoder.encode(c))
  const length = 8 + 4 + vendorBytes.length + 4 + entries.reduce((sum, e) => sum + 4 + e.length, 0)

  const tags = new Uint8Array(length)
  const view = new DataView(tags.buffer)
  tags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0) // "OpusTags"
  view.setUint32(8, vendorBytes.length, true)
  tags.set(vendorBytes, 12)

  let at = 12 + vendorBytes.length
  view.setUint32(at, entries.length, true)
  at += 4
  for (const entry of entries) {
    view.setUint32(at, entry.length, true)
    at += 4
    tags.set(entry, at)
    at += entry.length
  }
  return tags
}
