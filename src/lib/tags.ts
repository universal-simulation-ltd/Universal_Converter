// Reading and writing the handful of tags people actually care about — title,
// artist, album — so they survive a conversion instead of being silently
// dropped.
//
// Reading covers the three container families the app takes in:
//   • ID3v2 (MP3, and often AIFF)
//   • MP4 `ilst` atoms (M4A, MP4)
//   • Vorbis comments (FLAC, Ogg/Opus)
// Writing is ID3v2.3 only for now, which covers the MP3 target. The other
// encoders own their own containers and would each need their own writer.
//
// Everything here is byte-level and pure, so scripts/selftest.mjs exercises it
// without a browser.

export interface Tags {
  title?: string
  artist?: string
  album?: string
}

export function hasTags(tags: Tags): boolean {
  return Boolean(tags.title || tags.artist || tags.album)
}

// ── Reading ──────────────────────────────────────────────────────────────────

/**
 * Pull tags out of whatever container this is. Deliberately forgiving: an
 * unreadable or absent tag block returns {} rather than throwing, because losing
 * metadata must never fail a conversion.
 */
export function readTags(bytes: Uint8Array): Tags {
  try {
    if (startsWith(bytes, 'ID3')) return readId3(bytes)
    if (startsWith(bytes, 'fLaC')) return readVorbisComment(bytes, flacCommentOffset(bytes))
    if (startsWith(bytes, 'OggS')) return readOggOpusTags(bytes)
    if (bytes.length > 12 && ascii(bytes, 4, 4) === 'ftyp') return readMp4Tags(bytes)
    return {}
  } catch {
    return {}
  }
}

function startsWith(bytes: Uint8Array, text: string): boolean {
  if (bytes.length < text.length) return false
  for (let i = 0; i < text.length; i++) if (bytes[i] !== text.charCodeAt(i)) return false
  return true
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i])
  return out
}

/** ID3 sizes are "synchsafe": 7 bits per byte, so a size byte never looks like a frame sync. */
function synchsafe(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 21) | (bytes[offset + 1] << 14) | (bytes[offset + 2] << 7) | bytes[offset + 3]
}

function readId3(bytes: Uint8Array): Tags {
  const major = bytes[3]
  const size = synchsafe(bytes, 6)
  const end = Math.min(bytes.length, 10 + size)
  const tags: Tags = {}

  // v2.2 used 3-character frame ids and 3-byte sizes; v2.3+ uses 4 and 4.
  const idLength = major <= 2 ? 3 : 4
  const headerLength = major <= 2 ? 6 : 10
  const map: Record<string, keyof Tags> = major <= 2
    ? { TT2: 'title', TP1: 'artist', TAL: 'album' }
    : { TIT2: 'title', TPE1: 'artist', TALB: 'album' }

  let at = 10
  while (at + headerLength <= end) {
    const id = ascii(bytes, at, idLength)
    if (!/^[A-Z0-9]+$/.test(id)) break // padding
    const frameSize = major <= 2
      ? (bytes[at + 3] << 16) | (bytes[at + 4] << 8) | bytes[at + 5]
      : major === 4
        ? synchsafe(bytes, at + 4)
        : (bytes[at + 4] << 24) | (bytes[at + 5] << 16) | (bytes[at + 6] << 8) | bytes[at + 7]
    if (frameSize <= 0 || at + headerLength + frameSize > end) break

    const field = map[id]
    if (field) {
      const body = bytes.subarray(at + headerLength, at + headerLength + frameSize)
      tags[field] = decodeId3Text(body)
    }
    at += headerLength + frameSize
  }
  return tags
}

// The first byte of a text frame names its encoding: 0 = ISO-8859-1, 1 = UTF-16
// with a BOM, 2 = UTF-16BE, 3 = UTF-8.
function decodeId3Text(body: Uint8Array): string {
  if (body.length < 2) return ''
  const encoding = body[0]
  const data = body.subarray(1)
  const label = encoding === 1 ? 'utf-16' : encoding === 2 ? 'utf-16be' : encoding === 3 ? 'utf-8' : 'iso-8859-1'
  try {
    return new TextDecoder(label).decode(data).replace(/\0+$/, '').trim()
  } catch {
    return new TextDecoder('utf-8').decode(data).replace(/\0+$/, '').trim()
  }
}

/** FLAC: a 4-byte magic then metadata blocks; type 4 is the Vorbis comment. */
function flacCommentOffset(bytes: Uint8Array): number {
  let at = 4
  while (at + 4 <= bytes.length) {
    const isLast = (bytes[at] & 0x80) !== 0
    const type = bytes[at] & 0x7f
    const length = (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]
    if (type === 4) return at + 4
    if (isLast) break
    at += 4 + length
  }
  return -1
}

function readVorbisComment(bytes: Uint8Array, offset: number): Tags {
  if (offset < 0) return {}
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = offset
  const vendorLength = view.getUint32(at, true)
  at += 4 + vendorLength
  const count = view.getUint32(at, true)
  at += 4

  const tags: Tags = {}
  const decoder = new TextDecoder('utf-8')
  for (let i = 0; i < count && at + 4 <= bytes.length; i++) {
    const length = view.getUint32(at, true)
    at += 4
    const entry = decoder.decode(bytes.subarray(at, at + length))
    at += length
    const eq = entry.indexOf('=')
    if (eq < 0) continue
    const key = entry.slice(0, eq).toUpperCase()
    const value = entry.slice(eq + 1)
    if (key === 'TITLE') tags.title ??= value
    else if (key === 'ARTIST') tags.artist ??= value
    else if (key === 'ALBUM') tags.album ??= value
  }
  return tags
}

/** Ogg/Opus: the comment packet is `OpusTags` + a Vorbis comment body. */
function readOggOpusTags(bytes: Uint8Array): Tags {
  for (let at = 0; at + 8 < Math.min(bytes.length, 65_536); at++) {
    if (ascii(bytes, at, 8) === 'OpusTags') return readVorbisComment(bytes, at + 8)
  }
  return {}
}

/**
 * MP4: tags live in moov > udta > meta > ilst, with four-character atom names
 * (©nam, ©ART, ©alb). Rather than walking the whole box tree, scan for `ilst`
 * and read the atoms inside it — the structure below that point is flat.
 */
function readMp4Tags(bytes: Uint8Array): Tags {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let ilst = -1
  for (let at = 0; at + 8 <= bytes.length; at++) {
    if (ascii(bytes, at, 4) === 'ilst') {
      ilst = at + 4
      break
    }
  }
  if (ilst < 0) return {}

  const names: Record<string, keyof Tags> = { '©nam': 'title', '©ART': 'artist', '©alb': 'album' }
  const tags: Tags = {}
  let at = ilst
  const end = Math.min(bytes.length, ilst + 65_536)
  while (at + 8 <= end) {
    const size = view.getUint32(at)
    if (size < 8 || at + size > bytes.length) break
    const name = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7])
    const field = names[name]
    if (field && size > 24) {
      // atom > data box: 4 size + 4 'data' + 4 type + 4 locale, then the text.
      const text = new TextDecoder('utf-8').decode(bytes.subarray(at + 24, at + size))
      tags[field] = text.replace(/\0+$/, '').trim()
    }
    at += size
  }
  return tags
}

// ── Writing ──────────────────────────────────────────────────────────────────

const ID3_FRAMES: [keyof Tags, string][] = [
  ['title', 'TIT2'],
  ['artist', 'TPE1'],
  ['album', 'TALB'],
]

/**
 * Build an ID3v2.3 tag block to sit in front of MP3 frames. UTF-16 with a BOM
 * (encoding byte 1) rather than UTF-8, because v2.3 predates the UTF-8 encoding
 * byte and some players ignore tags that use it.
 */
export function buildId3(tags: Tags): Uint8Array {
  const frames: Uint8Array[] = []
  for (const [field, id] of ID3_FRAMES) {
    const value = tags[field]
    if (!value) continue
    const text = encodeUtf16WithBom(value)
    const frame = new Uint8Array(10 + 1 + text.length)
    const view = new DataView(frame.buffer)
    for (let i = 0; i < 4; i++) frame[i] = id.charCodeAt(i)
    view.setUint32(4, text.length + 1) // v2.3 sizes are plain 32-bit
    frame[10] = 1                      // encoding: UTF-16 with BOM
    frame.set(text, 11)
    frames.push(frame)
  }
  if (frames.length === 0) return new Uint8Array(0)

  const body = frames.reduce((sum, f) => sum + f.length, 0)
  const out = new Uint8Array(10 + body)
  out[0] = 0x49; out[1] = 0x44; out[2] = 0x33 // "ID3"
  out[3] = 3; out[4] = 0                       // v2.3.0
  out[5] = 0                                   // flags
  // The tag size is synchsafe: 7 bits per byte.
  out[6] = (body >> 21) & 0x7f
  out[7] = (body >> 14) & 0x7f
  out[8] = (body >> 7) & 0x7f
  out[9] = body & 0x7f
  let at = 10
  for (const frame of frames) {
    out.set(frame, at)
    at += frame.length
  }
  return out
}

function encodeUtf16WithBom(text: string): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2)
  const view = new DataView(out.buffer)
  view.setUint16(0, 0xfeff, true) // little-endian BOM
  for (let i = 0; i < text.length; i++) view.setUint16(2 + i * 2, text.charCodeAt(i), true)
  return out
}

/** Vorbis comment entries for the formats that take them (FLAC, Opus). */
export function vorbisComments(tags: Tags): string[] {
  const out: string[] = []
  if (tags.title) out.push(`TITLE=${tags.title}`)
  if (tags.artist) out.push(`ARTIST=${tags.artist}`)
  if (tags.album) out.push(`ALBUM=${tags.album}`)
  return out
}
