import { ZERO_MATRIX, ascii, box, concat, u16, u32, u32s, u8 } from './box.ts'

// A minimal MP4 (M4A) writer for a single AAC audio track — enough to wrap the
// frames WebCodecs gives us. Pure and DOM-free so scripts/selftest.mjs can check
// the box tree without a browser.
//
// An MP4 is a tree of boxes, each `[4-byte size][4-char type][payload]`. For
// audio-only the tree is:
//
//   ftyp                      what kind of file this is
//   moov                      all the metadata
//     mvhd                    movie header
//     trak                    one track
//       tkhd                  track header
//       mdia
//         mdhd                timescale + duration
//         hdlr                'soun'
//         minf
//           smhd, dinf/dref   sound media header; media is in this file
//           stbl              the sample tables — where every frame lives
//             stsd > mp4a > esds    codec config (AudioSpecificConfig)
//             stts, stsc, stsz, stco
//   mdat                      the frames themselves

export interface Mp4Input {
  /** Raw AAC frames, in order, without ADTS headers. */
  frames: Uint8Array[]
  /** AudioSpecificConfig from the encoder's `decoderConfig.description`. */
  description: Uint8Array
  sampleRate: number
  channels: number
  /** Samples per frame — 1024 for AAC-LC. */
  samplesPerFrame: number
  /**
   * Encoder priming, in samples, trimmed via an edit list so the file doesn't
   * start with silence the encoder added. Pass 0 to skip the edit list.
   */
  priming: number
}

/**
 * The `mp4a` sample entry — the audio track's codec description, wrapping an
 * `esds` that nests an ES_Descriptor around a DecoderConfigDescriptor (object
 * type 0x40 = AAC, stream type 0x15 = audio) and the AudioSpecificConfig.
 *
 * Shared with mp4mux.ts, which writes the same audio track alongside video.
 */
export function mp4aSampleEntry(description: Uint8Array, sampleRate: number, channels: number): Uint8Array {
  const dsi = concat([u8(0x05, description.length), description])
  const dcd = concat([
    u8(0x04, 13 + dsi.length, 0x40, 0x15),
    u8(0, 0, 0),          // buffer size
    u32(0), u32(0),       // max + average bitrate (0 = unknown)
    dsi,
  ])
  const sl = u8(0x06, 0x01, 0x02)
  const esDescriptor = concat([u8(0x03, 3 + dcd.length + sl.length, 0, 1, 0), dcd, sl])
  const esds = box('esds', u8(0, 0, 0, 0), esDescriptor)

  return box('mp4a', u8(0, 0, 0, 0, 0, 0), u16(1), u32s([0, 0]), u16(channels), u16(16),
    u16(0), u16(0), u32(sampleRate << 16), esds)
}

export function buildMp4(input: Mp4Input): Uint8Array {
  const { frames, description, sampleRate, channels, samplesPerFrame, priming } = input
  if (frames.length === 0) throw new Error('buildMp4 needs at least one frame')

  const mediaDuration = frames.length * samplesPerFrame
  // What a player is told to present, once the priming is dropped.
  const presentedDuration = Math.max(0, mediaDuration - priming)

  const ftyp = box('ftyp', ascii('M4A '), u32(0x200), ascii('M4A '), ascii('mp42'), ascii('isom'))

  // The sample tables. stco needs the byte offset of the first frame, which
  // isn't known until moov's own size is — so moov is built twice, with the
  // first pass only used to measure. Its size can't change between passes
  // because the offset is a fixed-width field.
  const buildMoov = (firstFrameOffset: number): Uint8Array => {
    const mvhd = box('mvhd', u8(0, 0, 0, 0), u32(0), u32(0), u32(sampleRate), u32(presentedDuration),
      u32(0x00010000), u16(0x0100), u16(0), u32s([0, 0]), u32s(ZERO_MATRIX), u32s([0, 0, 0, 0, 0, 0]), u32(2))

    const tkhd = box('tkhd', u8(0, 0, 0, 7), u32(0), u32(0), u32(1), u32(0), u32(presentedDuration),
      u32s([0, 0]), u16(0), u16(0), u16(0x0100), u16(0), u32s(ZERO_MATRIX), u32(0), u32(0))

    // An edit list starting at `priming` tells the player to skip the encoder's
    // warm-up samples, which are real audio data but not part of the source.
    const elst = priming > 0
      ? box('edts', box('elst', u8(0, 0, 0, 0), u32(1), u32(presentedDuration), u32(priming), u16(1), u16(0)))
      : new Uint8Array(0)

    const mdhd = box('mdhd', u8(0, 0, 0, 0), u32(0), u32(0), u32(sampleRate), u32(mediaDuration), u16(0x55c4), u16(0))
    const hdlr = box('hdlr', u8(0, 0, 0, 0), u32(0), ascii('soun'), u32s([0, 0, 0]), ascii('SoundHandler\0'))

    const smhd = box('smhd', u8(0, 0, 0, 0), u16(0), u16(0))
    const dinf = box('dinf', box('dref', u8(0, 0, 0, 0), u32(1), box('url ', u8(0, 0, 0, 1))))

    const stsd = box('stsd', u8(0, 0, 0, 0), u32(1), mp4aSampleEntry(description, sampleRate, channels))

    const stts = box('stts', u8(0, 0, 0, 0), u32(1), u32(frames.length), u32(samplesPerFrame))
    const stsc = box('stsc', u8(0, 0, 0, 0), u32(1), u32(1), u32(frames.length), u32(1))
    const stsz = box('stsz', u8(0, 0, 0, 0), u32(0), u32(frames.length), u32s(frames.map((f) => f.length)))
    const stco = box('stco', u8(0, 0, 0, 0), u32(1), u32(firstFrameOffset))

    const stbl = box('stbl', stsd, stts, stsc, stsz, stco)
    const minf = box('minf', smhd, dinf, stbl)
    const mdia = box('mdia', mdhd, hdlr, minf)
    const trak = box('trak', tkhd, elst, mdia)
    return box('moov', mvhd, trak)
  }

  const moovSize = buildMoov(0).length
  const firstFrameOffset = ftyp.length + moovSize + 8 // + mdat's own header
  const moov = buildMoov(firstFrameOffset)

  const mdat = box('mdat', ...frames)
  return concat([ftyp, moov, mdat])
}

export { boxTypeAt } from './box.ts'
