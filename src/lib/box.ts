// The ISO base media file format primitives, shared by the M4A writer
// (`mp4.ts`) and the audio+video muxer (`mp4mux.ts`). Pure and DOM-free so
// scripts/selftest.mjs can check the box trees without a browser.
//
// Every box is `[4-byte size][4-char type][payload]`; the payload is either
// more boxes or fixed-width fields. Nothing here knows what a track is — that
// vocabulary lives in the two writers.

export function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const payloadLength = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(8 + payloadLength)
  new DataView(out.buffer).setUint32(0, out.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  let offset = 8
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function u8(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

export function u16(value: number): Uint8Array {
  const out = new Uint8Array(2)
  new DataView(out.buffer).setUint16(0, value)
  return out
}

export function u32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value)
  return out
}

export function u32s(values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4)
  const view = new DataView(out.buffer)
  values.forEach((v, i) => view.setUint32(i * 4, v))
  return out
}

export function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** The identity display matrix every tkhd/mvhd carries when there's no rotation. */
export const ZERO_MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000]

/** Read a box's type at a byte offset — used by the tests, and for debugging. */
export function boxTypeAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
}
