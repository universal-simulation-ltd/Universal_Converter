// An MP4/MOV reader — the other half of mp4.ts.
//
// WebCodecs decodes *frames*, not files: `VideoDecoder` wants one
// EncodedVideoChunk at a time plus the codec's configuration record. Nothing in
// the browser will hand those over, so the container has to be taken apart here.
// That is the whole reason video can ship on the same MIT terms as Opus and M4A
// — the codec is the browser's, only the box parsing is ours.
//
// Scope is deliberately the non-fragmented `moov` + `mdat` layout that cameras,
// phones and every normal export produce. Fragmented MP4 (`moof`) is detected
// and refused with a sentence rather than parsed half-way.
//
// Pure and DOM-free, so scripts/selftest.mjs can round-trip it against our own
// writer without a browser.

export interface Sample {
  /** Byte range within the file. */
  offset: number
  size: number
  /** Presentation time and duration, both in `timescale` units. */
  pts: number
  duration: number
  /** Decode time in `timescale` units — differs from `pts` only with B-frames. */
  dts: number
  sync: boolean
}

export interface Track {
  id: number
  kind: 'video' | 'audio'
  /** Ticks per second for this track's sample times. */
  timescale: number
  /** Track length in `timescale` units. */
  duration: number
  /** The WebCodecs codec string, e.g. 'avc1.640028' or 'mp4a.40.2'. */
  codec: string
  /** avcC / hvcC / esds payload, as WebCodecs' `decoderConfig.description`. */
  description: Uint8Array | null
  /** Video only. */
  width: number
  height: number
  /** Audio only. */
  sampleRate: number
  channels: number
  samples: Sample[]
}

export class UnreadableVideoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnreadableVideoError'
  }
}

interface BoxHeader {
  type: string
  start: number
  /** First byte of the payload. */
  body: number
  /** One past the last byte of the box. */
  end: number
}

function readHeader(view: DataView, offset: number, limit: number): BoxHeader | null {
  if (offset + 8 > limit) return null
  let size = view.getUint32(offset)
  const type = String.fromCharCode(
    view.getUint8(offset + 4), view.getUint8(offset + 5),
    view.getUint8(offset + 6), view.getUint8(offset + 7),
  )
  let body = offset + 8
  if (size === 1) {
    // 64-bit size: the real length follows the type. Files over 4 GB use this.
    if (offset + 16 > limit) return null
    const high = view.getUint32(offset + 8)
    const low = view.getUint32(offset + 12)
    size = high * 2 ** 32 + low
    body = offset + 16
  } else if (size === 0) {
    // "to end of file" — only legal on the last box.
    size = limit - offset
  }
  if (size < 8 || offset + size > limit) return null
  return { type, start: offset, body, end: offset + size }
}

/** Walk the boxes directly inside [start, end). */
function* children(view: DataView, start: number, end: number): Generator<BoxHeader> {
  let offset = start
  while (offset < end) {
    const header = readHeader(view, offset, end)
    if (!header) return
    yield header
    offset = header.end
  }
}

function find(view: DataView, parent: BoxHeader, type: string): BoxHeader | null {
  for (const child of children(view, parent.body, parent.end)) {
    if (child.type === type) return child
  }
  return null
}

/** Follow a path of box types down from a parent, e.g. mdia > minf > stbl. */
function descend(view: DataView, from: BoxHeader, ...path: string[]): BoxHeader | null {
  let current: BoxHeader | null = from
  for (const type of path) {
    if (!current) return null
    current = find(view, current, type)
  }
  return current
}

function bytesOf(view: DataView, header: BoxHeader): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset + header.body, header.end - header.body)
}

/**
 * Parse a whole MP4/MOV into tracks with fully resolved sample tables.
 *
 * The file is read into memory in one go — the same assumption the audio side
 * already makes with `file.arrayBuffer()`, and the reason `LARGE_FILE_BYTES`
 * warns before anything starts.
 */
export function readMp4(bytes: Uint8Array): Track[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const limit = bytes.byteLength

  let moov: BoxHeader | null = null
  let sawMoof = false
  for (const top of children(view, 0, limit)) {
    if (top.type === 'moov') moov = top
    if (top.type === 'moof') sawMoof = true
  }

  if (!moov) {
    throw new UnreadableVideoError(
      sawMoof
        ? 'This is a fragmented MP4, which this converter can’t take apart yet — re-export it as a normal MP4'
        : 'This file has no MP4 movie header, so its frames can’t be located — it may be corrupt or not really an MP4',
    )
  }
  if (sawMoof) {
    throw new UnreadableVideoError(
      'This is a fragmented MP4, which this converter can’t take apart yet — re-export it as a normal MP4',
    )
  }

  const tracks: Track[] = []
  for (const trak of children(view, moov.body, moov.end)) {
    if (trak.type !== 'trak') continue
    const track = readTrak(view, trak)
    if (track) tracks.push(track)
  }
  return tracks
}

function readTrak(view: DataView, trak: BoxHeader): Track | null {
  const tkhd = find(view, trak, 'tkhd')
  const mdia = find(view, trak, 'mdia')
  if (!tkhd || !mdia) return null

  const mdhd = find(view, mdia, 'mdhd')
  const hdlr = find(view, mdia, 'hdlr')
  const stbl = descend(view, mdia, 'minf', 'stbl')
  if (!mdhd || !hdlr || !stbl) return null

  // hdlr's handler type sits 8 bytes into the payload, after version/flags and
  // a reserved word.
  const handler = String.fromCharCode(
    view.getUint8(hdlr.body + 8), view.getUint8(hdlr.body + 9),
    view.getUint8(hdlr.body + 10), view.getUint8(hdlr.body + 11),
  )
  const kind = handler === 'vide' ? 'video' : handler === 'soun' ? 'audio' : null
  if (!kind) return null

  // Version 1 widens the creation/modification times and duration to 64 bits,
  // which shifts every field after them.
  const mdhdVersion = view.getUint8(mdhd.body)
  const timescale = mdhdVersion === 1 ? view.getUint32(mdhd.body + 20) : view.getUint32(mdhd.body + 12)
  const duration = mdhdVersion === 1
    ? Number(view.getBigUint64(mdhd.body + 24))
    : view.getUint32(mdhd.body + 16)

  const tkhdVersion = view.getUint8(tkhd.body)
  const id = tkhdVersion === 1 ? view.getUint32(tkhd.body + 20) : view.getUint32(tkhd.body + 12)
  // Width/height are 16.16 fixed point at the very end of tkhd.
  const width = view.getUint32(tkhd.end - 8) / 65536
  const height = view.getUint32(tkhd.end - 4) / 65536

  const sample = readSampleEntry(view, stbl, kind)
  if (!sample) return null

  return {
    id,
    kind,
    timescale: timescale || 1000,
    duration,
    codec: sample.codec,
    description: sample.description,
    width: Math.round(width) || sample.width,
    height: Math.round(height) || sample.height,
    sampleRate: sample.sampleRate,
    channels: sample.channels,
    samples: readSampleTable(view, stbl, timescale || 1000),
  }
}

interface SampleEntry {
  codec: string
  description: Uint8Array | null
  width: number
  height: number
  sampleRate: number
  channels: number
}

function readSampleEntry(view: DataView, stbl: BoxHeader, kind: 'video' | 'audio'): SampleEntry | null {
  const stsd = find(view, stbl, 'stsd')
  if (!stsd) return null
  // stsd: version/flags (4), entry count (4), then the entries as boxes.
  const entry = readHeader(view, stsd.body + 8, stsd.end)
  if (!entry) return null

  if (kind === 'video') {
    // A VisualSampleEntry is 78 bytes of fixed fields, then extension boxes —
    // avcC for H.264, hvcC for HEVC.
    const width = view.getUint16(entry.body + 24)
    const height = view.getUint16(entry.body + 26)
    const extStart = entry.body + 78
    let description: Uint8Array | null = null
    let codec = entry.type
    for (const ext of children(view, extStart, entry.end)) {
      if (ext.type === 'avcC') {
        description = bytesOf(view, ext)
        // The profile/constraint/level triple at bytes 1–3 is what the codec
        // string spells out, and WebCodecs matches on it.
        codec = `avc1.${[...description.slice(1, 4)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
        break
      }
      if (ext.type === 'hvcC') {
        description = bytesOf(view, ext)
        codec = 'hev1.1.6.L93.B0'
        break
      }
      if (ext.type === 'vpcC') {
        description = bytesOf(view, ext)
        codec = 'vp09.00.10.08'
        break
      }
    }
    return { codec, description, width, height, sampleRate: 0, channels: 0 }
  }

  // An AudioSampleEntry is 28 bytes of fixed fields, then esds for AAC.
  const channels = view.getUint16(entry.body + 16)
  const sampleRate = view.getUint32(entry.body + 24) / 65536
  let description: Uint8Array | null = null
  for (const ext of children(view, entry.body + 28, entry.end)) {
    if (ext.type === 'esds') {
      description = readAudioSpecificConfig(bytesOf(view, ext))
      break
    }
  }
  return {
    codec: entry.type === 'mp4a' ? 'mp4a.40.2' : entry.type,
    description,
    width: 0,
    height: 0,
    sampleRate,
    channels,
  }
}

/**
 * Dig the AudioSpecificConfig out of an esds box.
 *
 * esds nests length-prefixed descriptors: ES_Descriptor (0x03) wraps
 * DecoderConfigDescriptor (0x04) wraps DecoderSpecificInfo (0x05), which is the
 * two-to-five bytes WebCodecs actually wants. Lengths are 7 bits per byte with
 * the top bit meaning "another length byte follows".
 */
function readAudioSpecificConfig(esds: Uint8Array): Uint8Array | null {
  let i = 4 // version + flags
  const readLength = (): number => {
    let value = 0
    for (let n = 0; n < 4; n++) {
      const byte = esds[i++]
      value = (value << 7) | (byte & 0x7f)
      if ((byte & 0x80) === 0) break
    }
    return value
  }

  while (i < esds.length) {
    const tag = esds[i++]
    const length = readLength()
    if (tag === 0x03) {
      i += 2 // ES_ID
      const flags = esds[i++]
      if (flags & 0x80) i += 2 // stream dependency
      if (flags & 0x40) i += 1 + esds[i] // URL
      if (flags & 0x20) i += 2 // OCR stream
      continue
    }
    if (tag === 0x04) {
      i += 13 // object type, stream type, buffer size, bitrates
      continue
    }
    if (tag === 0x05) return esds.slice(i, i + length)
    i += length
  }
  return null
}

/**
 * Resolve stts/stsc/stsz/stco/stss/ctts into a flat list of samples.
 *
 * The five tables are each run-length compressed against a different axis —
 * time, chunk, size, offset, keyframe — and only make sense together, which is
 * why this is one function rather than five.
 */
function readSampleTable(view: DataView, stbl: BoxHeader, timescale: number): Sample[] {
  const stts = find(view, stbl, 'stts')
  const stsc = find(view, stbl, 'stsc')
  const stsz = find(view, stbl, 'stsz')
  const stco = find(view, stbl, 'stco') ?? find(view, stbl, 'co64')
  if (!stts || !stsc || !stsz || !stco) return []

  // Sizes: a non-zero "uniform size" means every sample is that big.
  const uniformSize = view.getUint32(stsz.body + 4)
  const sampleCount = view.getUint32(stsz.body + 8)
  const sizeAt = (index: number): number =>
    uniformSize !== 0 ? uniformSize : view.getUint32(stsz.body + 12 + index * 4)

  // Chunk offsets, 32- or 64-bit.
  const wide = stco.type === 'co64'
  const chunkCount = view.getUint32(stco.body + 4)
  const chunkOffset = (index: number): number =>
    wide
      ? Number(view.getBigUint64(stco.body + 8 + index * 8))
      : view.getUint32(stco.body + 8 + index * 4)

  // stsc says "from chunk N on, each chunk holds K samples" — expand it into a
  // per-chunk count.
  const stscEntries = view.getUint32(stsc.body + 4)
  const perChunk = new Array<number>(chunkCount).fill(0)
  for (let e = 0; e < stscEntries; e++) {
    const first = view.getUint32(stsc.body + 8 + e * 12) - 1
    const count = view.getUint32(stsc.body + 8 + e * 12 + 4)
    const nextFirst = e + 1 < stscEntries
      ? view.getUint32(stsc.body + 8 + (e + 1) * 12) - 1
      : chunkCount
    for (let c = first; c < Math.min(nextFirst, chunkCount); c++) perChunk[c] = count
  }

  // Durations, run-length encoded against sample index.
  const sttsEntries = view.getUint32(stts.body + 4)
  const durations: { count: number; delta: number }[] = []
  for (let e = 0; e < sttsEntries; e++) {
    durations.push({
      count: view.getUint32(stts.body + 8 + e * 8),
      delta: view.getUint32(stts.body + 8 + e * 8 + 4),
    })
  }

  // ctts: presentation offset from decode time, present only with B-frames.
  const ctts = find(view, stbl, 'ctts')
  const compositionOffsets: number[] = []
  if (ctts) {
    const entries = view.getUint32(ctts.body + 4)
    const signed = view.getUint8(ctts.body) === 1
    for (let e = 0; e < entries; e++) {
      const count = view.getUint32(ctts.body + 8 + e * 8)
      const offset = signed
        ? view.getInt32(ctts.body + 8 + e * 8 + 4)
        : view.getUint32(ctts.body + 8 + e * 8 + 4)
      for (let n = 0; n < count; n++) compositionOffsets.push(offset)
    }
  }

  // stss lists the keyframes. No stss at all means every sample is one.
  const stss = find(view, stbl, 'stss')
  let syncSet: Set<number> | null = null
  if (stss) {
    syncSet = new Set<number>()
    const entries = view.getUint32(stss.body + 4)
    for (let e = 0; e < entries; e++) syncSet.add(view.getUint32(stss.body + 8 + e * 4) - 1)
  }

  const samples: Sample[] = []
  let index = 0
  let dts = 0
  let runIndex = 0
  let runLeft = durations.length > 0 ? durations[0].count : 0

  for (let chunk = 0; chunk < chunkCount && index < sampleCount; chunk++) {
    let offset = chunkOffset(chunk)
    for (let n = 0; n < perChunk[chunk] && index < sampleCount; n++) {
      while (runLeft === 0 && runIndex + 1 < durations.length) {
        runIndex++
        runLeft = durations[runIndex].count
      }
      const delta = durations[runIndex]?.delta ?? Math.round(timescale / 30)
      const size = sizeAt(index)
      samples.push({
        offset,
        size,
        dts,
        pts: dts + (compositionOffsets[index] ?? 0),
        duration: delta,
        sync: syncSet ? syncSet.has(index) : true,
      })
      offset += size
      dts += delta
      if (runLeft > 0) runLeft--
      index++
    }
  }
  return samples
}
