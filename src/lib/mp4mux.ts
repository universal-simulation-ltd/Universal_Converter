// The MP4 writer for a movie: one H.264 video track and, optionally, one AAC
// audio track. mp4.ts writes the audio-only M4A case; this is the same box
// vocabulary with a `vide` track added, kept separate because a video track
// brings three tables the audio one never needs — per-sample durations, a
// keyframe list, and a composition-offset table when the encoder reorders.
//
//   ftyp
//   moov
//     mvhd
//     trak (video)   tkhd, mdia > mdhd/hdlr/minf > vmhd, dinf, stbl
//                      stsd > avc1 > avcC
//                      stts (durations), stss (keyframes), ctts (reordering),
//                      stsc, stsz, stco
//     trak (audio)   the same tree with smhd + stsd > mp4a > esds
//   mdat             video samples, then audio samples
//
// Pure and DOM-free so scripts/selftest.mjs can check the tree without a browser.

import { ZERO_MATRIX, ascii, box, concat, u16, u32, u32s, u8 } from './box.ts'
import { mp4aSampleEntry } from './mp4.ts'

/** WebCodecs hands out microsecond timestamps, so the tracks count in them too. */
export const TIMESCALE = 1_000_000

/** The movie header's own timescale — milliseconds, as is conventional. */
const MOVIE_TIMESCALE = 1000

export interface VideoSample {
  bytes: Uint8Array
  /** Presentation timestamp, microseconds. */
  timestamp: number
  /** Microseconds this frame is on screen. */
  duration: number
  keyframe: boolean
}

export interface AudioTrackInput {
  /** Raw AAC frames, in order, without ADTS headers. */
  frames: Uint8Array[]
  /** AudioSpecificConfig from the encoder's `decoderConfig.description`. */
  description: Uint8Array
  sampleRate: number
  channels: number
  /** Samples per frame — 1024 for AAC-LC. */
  samplesPerFrame: number
}

export interface Mp4MovieInput {
  video: {
    samples: VideoSample[]
    /** The avcC record from the encoder's `decoderConfig.description`. */
    description: Uint8Array
    width: number
    height: number
  }
  audio: AudioTrackInput | null
}

export function buildMp4Movie(input: Mp4MovieInput): Uint8Array {
  const { video, audio } = input
  if (video.samples.length === 0) throw new Error('buildMp4Movie needs at least one video frame')

  const videoBytes = video.samples.reduce((sum, s) => sum + s.bytes.length, 0)
  const audioBytes = audio ? audio.frames.reduce((sum, f) => sum + f.length, 0) : 0

  const videoDuration = video.samples.reduce((sum, s) => sum + s.duration, 0)
  const audioDuration = audio ? audio.frames.length * audio.samplesPerFrame : 0
  const movieDuration = Math.round(
    Math.max(
      videoDuration / TIMESCALE,
      audio ? audioDuration / audio.sampleRate : 0,
    ) * MOVIE_TIMESCALE,
  )

  const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isom'), ascii('mp42'), ascii('avc1'))

  // stco carries absolute file offsets, which aren't known until moov's size is
  // — so moov is built once to measure and once for real. Its size can't change
  // between the passes because every offset field is fixed width.
  const buildMoov = (videoOffset: number, audioOffset: number): Uint8Array => {
    const mvhd = box('mvhd', u8(0, 0, 0, 0), u32(0), u32(0), u32(MOVIE_TIMESCALE), u32(movieDuration),
      u32(0x00010000), u16(0x0100), u16(0), u32s([0, 0]), u32s(ZERO_MATRIX), u32s([0, 0, 0, 0, 0, 0]),
      u32(audio ? 3 : 2))

    const traks = [videoTrak(video, videoOffset, movieDuration)]
    if (audio) traks.push(audioTrak(audio, audioOffset, movieDuration))
    return box('moov', mvhd, ...traks)
  }

  const moovSize = buildMoov(0, 0).length
  const videoOffset = ftyp.length + moovSize + 8 // + mdat's own header
  const audioOffset = videoOffset + videoBytes

  if (audioOffset + audioBytes > 0xffffffff) {
    throw new Error('This conversion came out over 4 GB, which needs 64-bit chunk offsets — try a smaller size or a lower quality')
  }

  const moov = buildMoov(videoOffset, audioOffset)
  const mdat = box('mdat', ...video.samples.map((s) => s.bytes), ...(audio ? audio.frames : []))
  return concat([ftyp, moov, mdat])
}

function videoTrak(
  video: Mp4MovieInput['video'],
  dataOffset: number,
  movieDuration: number,
): Uint8Array {
  const { samples, description, width, height } = video
  const mediaDuration = samples.reduce((sum, s) => sum + s.duration, 0)

  const tkhd = box('tkhd', u8(0, 0, 0, 7), u32(0), u32(0), u32(1), u32(0), u32(movieDuration),
    u32s([0, 0]), u16(0), u16(0), u16(0), u16(0), u32s(ZERO_MATRIX),
    u32(width * 65536), u32(height * 65536))

  const mdhd = box('mdhd', u8(0, 0, 0, 0), u32(0), u32(0), u32(TIMESCALE), u32(mediaDuration), u16(0x55c4), u16(0))
  const hdlr = box('hdlr', u8(0, 0, 0, 0), u32(0), ascii('vide'), u32s([0, 0, 0]), ascii('VideoHandler\0'))

  const vmhd = box('vmhd', u8(0, 0, 0, 1), u16(0), u16(0), u16(0), u16(0))
  const dinf = box('dinf', box('dref', u8(0, 0, 0, 0), u32(1), box('url ', u8(0, 0, 0, 1))))

  const avcC = box('avcC', description)
  // A VisualSampleEntry: 78 bytes of fixed fields, then the codec's own box.
  // `compressorname` is a 32-byte Pascal string, left empty here.
  const avc1 = box('avc1',
    u8(0, 0, 0, 0, 0, 0), u16(1),           // reserved, data reference index
    u16(0), u16(0), u32s([0, 0, 0]),        // pre_defined, reserved
    u16(width), u16(height),
    u32(0x00480000), u32(0x00480000),       // 72 dpi horizontal + vertical
    u32(0), u16(1),                         // reserved, frame count
    new Uint8Array(32),                     // compressorname
    u16(0x0018), u16(0xffff),               // depth, pre_defined (-1)
    avcC)
  const stsd = box('stsd', u8(0, 0, 0, 0), u32(1), avc1)

  // Durations are run-length encoded: a constant-frame-rate clip collapses to a
  // single entry, a variable-frame-rate screen recording to one per change.
  const runs: { count: number; delta: number }[] = []
  for (const sample of samples) {
    const last = runs[runs.length - 1]
    if (last && last.delta === sample.duration) last.count++
    else runs.push({ count: 1, delta: sample.duration })
  }
  const stts = box('stts', u8(0, 0, 0, 0), u32(runs.length),
    ...runs.map((r) => concat([u32(r.count), u32(r.delta)])))

  // stss lists keyframes, 1-based. Omitted entirely when every frame is one,
  // which is what "every frame a keyframe" means to a player.
  const keyframes = samples.map((s, i) => (s.keyframe ? i + 1 : 0)).filter(Boolean)
  const stss = keyframes.length === samples.length
    ? new Uint8Array(0)
    : box('stss', u8(0, 0, 0, 0), u32(keyframes.length), u32s(keyframes))

  // ctts holds presentation-minus-decode offsets, and is needed only when the
  // encoder reorders frames. Samples arrive in decode order; a non-zero offset
  // anywhere means the whole table has to be written.
  let decodeTime = 0
  const offsets = samples.map((s) => {
    const offset = s.timestamp - decodeTime
    decodeTime += s.duration
    return offset
  })
  const ctts = offsets.some((o) => o !== 0)
    ? box('ctts', u8(1, 0, 0, 0), u32(offsets.length),
        ...offsets.map((o) => {
          const out = new Uint8Array(4)
          new DataView(out.buffer).setInt32(0, o)
          return out
        }))
    : new Uint8Array(0)

  const stsc = box('stsc', u8(0, 0, 0, 0), u32(1), u32(1), u32(samples.length), u32(1))
  const stsz = box('stsz', u8(0, 0, 0, 0), u32(0), u32(samples.length), u32s(samples.map((s) => s.bytes.length)))
  const stco = box('stco', u8(0, 0, 0, 0), u32(1), u32(dataOffset))

  const stbl = box('stbl', stsd, stts, stss, ctts, stsc, stsz, stco)
  const minf = box('minf', vmhd, dinf, stbl)
  const mdia = box('mdia', mdhd, hdlr, minf)
  return box('trak', tkhd, mdia)
}

function audioTrak(audio: AudioTrackInput, dataOffset: number, movieDuration: number): Uint8Array {
  const { frames, description, sampleRate, channels, samplesPerFrame } = audio
  const mediaDuration = frames.length * samplesPerFrame

  const tkhd = box('tkhd', u8(0, 0, 0, 7), u32(0), u32(0), u32(2), u32(0), u32(movieDuration),
    u32s([0, 0]), u16(0), u16(0), u16(0x0100), u16(0), u32s(ZERO_MATRIX), u32(0), u32(0))

  const mdhd = box('mdhd', u8(0, 0, 0, 0), u32(0), u32(0), u32(sampleRate), u32(mediaDuration), u16(0x55c4), u16(0))
  const hdlr = box('hdlr', u8(0, 0, 0, 0), u32(0), ascii('soun'), u32s([0, 0, 0]), ascii('SoundHandler\0'))

  const smhd = box('smhd', u8(0, 0, 0, 0), u16(0), u16(0))
  const dinf = box('dinf', box('dref', u8(0, 0, 0, 0), u32(1), box('url ', u8(0, 0, 0, 1))))

  const stsd = box('stsd', u8(0, 0, 0, 0), u32(1), mp4aSampleEntry(description, sampleRate, channels))
  const stts = box('stts', u8(0, 0, 0, 0), u32(1), u32(frames.length), u32(samplesPerFrame))
  const stsc = box('stsc', u8(0, 0, 0, 0), u32(1), u32(1), u32(frames.length), u32(1))
  const stsz = box('stsz', u8(0, 0, 0, 0), u32(0), u32(frames.length), u32s(frames.map((f) => f.length)))
  const stco = box('stco', u8(0, 0, 0, 0), u32(1), u32(dataOffset))

  const stbl = box('stbl', stsd, stts, stsc, stsz, stco)
  const minf = box('minf', smhd, dinf, stbl)
  const mdia = box('mdia', mdhd, hdlr, minf)
  return box('trak', tkhd, mdia)
}
