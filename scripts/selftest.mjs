// Self-tests for the parts that produce bytes other software has to read: the
// WAV, AIFF, MP3 and ZIP writers, plus the resize maths. Each is checked against
// a real third-party reader — macOS `afinfo`, `unzip`, python's `zipfile` —
// because "our reader agrees with our writer" proves nothing.
//
//   node scripts/selftest.mjs
//
// Node 24 strips the TypeScript types on import, so the source is tested
// directly, with no build step. That's also why the modules under test import
// their leaf dependencies with an explicit `.ts` extension.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

import { encodeWav } from '../src/lib/wav.ts'
import { encodeAiff } from '../src/lib/aiff.ts'
import { encodeMp3 } from '../src/lib/mp3.ts'
import { targetSize } from '../src/lib/resize.ts'
import { parseClock } from '../src/lib/humanise.ts'
import { createZip, crc32 } from '../src/lib/zip.ts'
import { HEADER_BOS, HEADER_EOS, buildPage, oggCrc, opusHead, opusTags } from '../src/lib/ogg.ts'
import { buildMp4, boxTypeAt } from '../src/lib/mp4.ts'
import { buildMp4Movie, TIMESCALE } from '../src/lib/mp4mux.ts'
import { readMp4 } from '../src/lib/mp4read.ts'
import { targetFrameSize, videoBitrate } from '../src/lib/framesize.ts'
import { buildId3, readTags, vorbisComments } from '../src/lib/tags.ts'

// A 1-second 440 Hz tone, the input for the encoder round-trips below.
function tone(sampleRate = 44100, seconds = 1) {
  const samples = new Float32Array(sampleRate * seconds)
  for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5
  return samples
}

// `afinfo` is macOS-only. Rather than take the whole suite down on Linux, the
// checks that need it say loudly that they didn't run — a skip that announces
// itself is honest; one that prints a tick is not.
let skipped = 0
function afinfo(path) {
  try {
    return execFileSync('afinfo', [path], { encoding: 'utf8' })
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    return null
  }
}

function ascii(view, offset, length) {
  let out = ''
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i))
  return out
}

// ── WAV ──────────────────────────────────────────────────────────────────────
{
  const left = new Float32Array([0, 1, -1, 0.5])
  const right = new Float32Array([0, -1, 1, -0.5])
  const buffer = encodeWav([left, right], 44100)
  const view = new DataView(buffer)

  assert.equal(buffer.byteLength, 44 + 4 * 2 * 2, 'header + 4 stereo 16-bit frames')
  assert.equal(ascii(view, 0, 4), 'RIFF')
  assert.equal(view.getUint32(4, true), buffer.byteLength - 8, 'RIFF size excludes the first 8 bytes')
  assert.equal(ascii(view, 8, 4), 'WAVE')
  assert.equal(ascii(view, 12, 4), 'fmt ')
  assert.equal(view.getUint16(20, true), 1, 'PCM')
  assert.equal(view.getUint16(22, true), 2, 'stereo')
  assert.equal(view.getUint32(24, true), 44100, 'sample rate')
  assert.equal(view.getUint32(28, true), 44100 * 2 * 2, 'byte rate')
  assert.equal(view.getUint16(32, true), 4, 'block align')
  assert.equal(view.getUint16(34, true), 16, 'bit depth')
  assert.equal(ascii(view, 36, 4), 'data')
  assert.equal(view.getUint32(40, true), 16, 'data chunk length')

  // Interleaved L R L R, with full-scale mapping to the int16 extremes.
  assert.equal(view.getInt16(44, true), 0)
  assert.equal(view.getInt16(46, true), 0)
  assert.equal(view.getInt16(48, true), 32767, 'peak positive clamps to 0x7FFF')
  assert.equal(view.getInt16(50, true), -32768, 'peak negative reaches 0x8000')

  // Values beyond full scale are clipped, not wrapped.
  const clipped = new DataView(encodeWav([new Float32Array([4, -4])], 8000))
  assert.equal(clipped.getInt16(44, true), 32767)
  assert.equal(clipped.getInt16(46, true), -32768)

  console.log('✓ wav — header fields, interleaving, clipping')
}

// ── AIFF ─────────────────────────────────────────────────────────────────────
// Checked with macOS `afinfo` rather than by re-reading our own bytes: the
// 80-bit extended sample rate is exactly the field a hand-rolled reader would
// get wrong in the same way the writer did.
{
  const samples = tone(44100, 1)
  const buffer = encodeAiff([samples, samples], 44100)
  const view = new DataView(buffer)

  assert.equal(ascii(view, 0, 4), 'FORM')
  assert.equal(ascii(view, 8, 4), 'AIFF')
  assert.equal(ascii(view, 12, 4), 'COMM')
  assert.equal(view.getUint16(20), 2, 'stereo (big-endian)')
  assert.equal(view.getUint32(22), 44100, 'frames')
  assert.equal(view.getUint16(26), 16, 'bit depth')
  assert.equal(ascii(view, 38, 4), 'SSND')

  const dir = mkdtempSync(join(tmpdir(), 'uniconv-'))
  const path = join(dir, 'tone.aiff')
  writeFileSync(path, Buffer.from(buffer))
  const info = afinfo(path)
  if (info) {
    assert.match(info, /44100 Hz/, 'afinfo reads the 80-bit extended sample rate back as 44100')
    assert.match(info, /2 ch/, 'afinfo sees two channels')
    assert.match(info, /estimated duration: 1\.0+ sec/, 'one second of audio')
    console.log('✓ aiff — afinfo reads rate, channels and duration back')
  } else {
    skipped++
    console.log('⚠ aiff — header checked, but afinfo is macOS-only so the 80-bit rate went unverified')
  }
}

// ── MP3 ──────────────────────────────────────────────────────────────────────
{
  const samples = tone(44100, 1)
  const blob = await encodeMp3([samples, samples], 44100, 192)
  const bytes = Buffer.from(await blob.arrayBuffer())

  assert.equal(blob.type, 'audio/mpeg')
  assert.ok(bytes.length > 8000, `a second of 192 kbps should be ~24 KB, got ${bytes.length}`)
  // Every MP3 frame starts with 11 set sync bits; the first frame is at byte 0
  // because LAME's JS port emits no ID3 header.
  assert.equal(bytes[0], 0xff, 'frame sync byte 1')
  assert.equal(bytes[1] & 0xe0, 0xe0, 'frame sync byte 2')

  const dir = mkdtempSync(join(tmpdir(), 'uniconv-'))
  const path = join(dir, 'tone.mp3')
  writeFileSync(path, bytes)
  const info = afinfo(path)
  if (info) {
    assert.match(info, /MPEG.*Layer 3|\.mp3/i, 'afinfo recognises it as MPEG audio')
    assert.match(info, /44100 Hz/, 'sample rate survives')
  } else {
    skipped++
  }

  await assert.rejects(
    () => encodeMp3([samples], 96000, 192),
    /96000 Hz/,
    'an unsupported LAME rate is refused with a message naming it',
  )

  console.log(info
    ? '✓ mp3 — LAME output is real MPEG audio afinfo can read'
    : '⚠ mp3 — frame sync checked, but afinfo is macOS-only so the stream went unverified')
}

// ── Image sizing ─────────────────────────────────────────────────────────────
{
  assert.deepEqual(targetSize(4000, 3000, 1920), { width: 1920, height: 1440 }, 'landscape fits the long edge')
  assert.deepEqual(targetSize(3000, 4000, 1920), { width: 1440, height: 1920 }, 'portrait fits the long edge')
  assert.deepEqual(targetSize(800, 600, 1920), { width: 800, height: 600 }, 'never scales up')
  assert.deepEqual(targetSize(800, 600, 'source'), { width: 800, height: 600 }, 'source keeps size')
  console.log('✓ image — resize keeps aspect ratio and never upscales')
}

// ── Trim parsing ─────────────────────────────────────────────────────────────
{
  assert.equal(parseClock('90'), 90, 'bare seconds')
  assert.equal(parseClock('1:30'), 90, 'mm:ss')
  assert.equal(parseClock('1:02:03'), 3723, 'h:mm:ss')
  assert.equal(parseClock(' 0:05 '), 5, 'surrounding space is fine')
  assert.equal(parseClock('2.5'), 2.5, 'fractional seconds')
  assert.equal(parseClock(''), null, 'empty is not zero — the field decides what that means')
  assert.equal(parseClock('abc'), null)
  assert.equal(parseClock('1:75'), null, 'minutes past 59 are a typo, not 75 seconds')
  assert.equal(parseClock('-5'), null)
  console.log('✓ trim — clock parsing accepts seconds, mm:ss and h:mm:ss, rejects the rest')
}

// ── Ogg ──────────────────────────────────────────────────────────────────────
// The container is written by hand, and a malformed page is rejected wholesale
// by every demuxer with no useful error, so the structure is pinned here.
{
  const page = buildPage({
    packets: [new Uint8Array([1, 2, 3])],
    granulePosition: 0,
    serial: 0x554e4943,
    sequence: 0,
    headerType: HEADER_BOS,
  })
  const view = new DataView(page.buffer)

  assert.equal(ascii(view, 0, 4), 'OggS')
  assert.equal(page[4], 0, 'stream structure version')
  assert.equal(page[5], HEADER_BOS)
  assert.equal(view.getUint32(14, true), 0x554e4943, 'serial')
  assert.equal(page[26], 1, 'one segment for a 3-byte packet')
  assert.equal(page[27], 3, 'segment length')
  assert.deepEqual([...page.slice(28)], [1, 2, 3], 'payload follows the segment table')

  // Lacing: a packet that is an exact multiple of 255 needs a trailing zero
  // segment, or a reader waits forever for a continuation that never comes.
  const exact = buildPage({
    packets: [new Uint8Array(510)],
    granulePosition: 0, serial: 1, sequence: 1, headerType: 0,
  })
  assert.equal(exact[26], 3, '510 bytes → 255, 255, 0')
  assert.deepEqual([...exact.slice(27, 30)], [255, 255, 0])

  // Granule position is 64-bit little-endian, written as a split pair.
  const big = buildPage({
    packets: [new Uint8Array([0])],
    granulePosition: 0x1_0000_0001, serial: 1, sequence: 2, headerType: HEADER_EOS,
  })
  const bigView = new DataView(big.buffer)
  assert.equal(bigView.getUint32(6, true), 1, 'low word')
  assert.equal(bigView.getUint32(10, true), 1, 'high word')
  assert.equal(big[5], HEADER_EOS)

  // Ogg's CRC is its own variant — poly 0x04C11DB7, unreflected. The checksum
  // must cover the whole page with the field zeroed while computing.
  const stored = view.getUint32(22, true)
  const zeroed = page.slice()
  new DataView(zeroed.buffer).setUint32(22, 0, true)
  assert.equal(stored, oggCrc(zeroed), 'checksum covers the page with its own field zeroed')
  assert.notEqual(oggCrc(new Uint8Array([1, 2, 3])), crc32(new Uint8Array([1, 2, 3])), 'not the ZIP variant')

  // OpusHead / OpusTags field layout.
  const head = opusHead(2, 312, 44100)
  const headView = new DataView(head.buffer)
  assert.equal(ascii(headView, 0, 8), 'OpusHead')
  assert.equal(head[8], 1, 'version')
  assert.equal(head[9], 2, 'channels')
  assert.equal(headView.getUint16(10, true), 312, 'pre-skip')
  assert.equal(headView.getUint32(12, true), 44100, 'original input rate is preserved in the header')
  assert.equal(head[18], 0, 'mapping family 0')

  const tags = opusTags('x')
  const tagsView = new DataView(tags.buffer)
  assert.equal(ascii(tagsView, 0, 8), 'OpusTags')
  assert.equal(tagsView.getUint32(8, true), 1, 'vendor length')
  assert.equal(tagsView.getUint32(13, true), 0, 'zero user comments')

  console.log('✓ ogg — page header, lacing, 64-bit granule, Opus header packets')
}

// ── MP4 / M4A ────────────────────────────────────────────────────────────────
// The one field that silently ruins an MP4 is stco: it holds the absolute byte
// offset of the first frame, so it can only be written once moov's own size is
// known. If it's wrong the file parses and plays silence.
{
  const frames = [new Uint8Array(100).fill(1), new Uint8Array(250).fill(2), new Uint8Array(75).fill(3)]
  const description = new Uint8Array([0x12, 0x10]) // a real AudioSpecificConfig is 2 bytes for AAC-LC 44.1k stereo
  const mp4 = buildMp4({
    frames, description, sampleRate: 44100, channels: 2, samplesPerFrame: 1024, priming: 2112,
  })
  const view = new DataView(mp4.buffer, mp4.byteOffset, mp4.byteLength)

  assert.equal(boxTypeAt(mp4, 0), 'ftyp')
  assert.equal(String.fromCharCode(...mp4.slice(8, 12)), 'M4A ', 'major brand')

  const ftypSize = view.getUint32(0)
  assert.equal(boxTypeAt(mp4, ftypSize), 'moov')
  const moovSize = view.getUint32(ftypSize)
  assert.equal(boxTypeAt(mp4, ftypSize + moovSize), 'mdat')

  // Find stco and check its offset lands exactly on the first frame's bytes.
  const text = new TextDecoder('latin1').decode(mp4)
  const stcoAt = text.indexOf('stco')
  assert.ok(stcoAt > 0, 'stco present')
  const firstFrameOffset = view.getUint32(stcoAt + 4 + 4 + 4) // type + version/flags + entry count
  assert.equal(firstFrameOffset, ftypSize + moovSize + 8, 'stco points past mdat’s own header')
  assert.deepEqual([...mp4.slice(firstFrameOffset, firstFrameOffset + 3)], [1, 1, 1], 'and the bytes there are frame one')

  // stsz carries one size per frame, in order.
  const stszAt = text.indexOf('stsz')
  assert.equal(view.getUint32(stszAt + 4 + 4), 0, 'sample_size 0 = per-sample table follows')
  assert.equal(view.getUint32(stszAt + 4 + 8), 3, 'sample count')
  assert.deepEqual(
    [0, 1, 2].map((i) => view.getUint32(stszAt + 4 + 12 + i * 4)),
    [100, 250, 75],
    'per-frame sizes',
  )

  // stts: every frame is the same length, so one entry describes them all.
  const sttsAt = text.indexOf('stts')
  assert.equal(view.getUint32(sttsAt + 8), 1, 'one time-to-sample entry')
  assert.equal(view.getUint32(sttsAt + 12), 3, 'sample count')
  assert.equal(view.getUint32(sttsAt + 16), 1024, 'samples per frame')

  // The edit list trims the encoder priming so playback doesn't open on silence.
  const elstAt = text.indexOf('elst')
  assert.ok(elstAt > 0, 'edit list present when priming > 0')
  assert.equal(view.getUint32(elstAt + 16), 2112, 'media_time starts after the priming samples')

  const noPriming = buildMp4({
    frames, description, sampleRate: 44100, channels: 2, samplesPerFrame: 1024, priming: 0,
  })
  assert.equal(new TextDecoder('latin1').decode(noPriming).indexOf('elst'), -1, 'no edit list when priming is 0')

  assert.equal(mp4.length, ftypSize + moovSize + 8 + 425, 'total length = boxes + frames')
  console.log('✓ mp4 — box order, stco offset, sample tables, priming edit list')
}

// ── Tags ─────────────────────────────────────────────────────────────────────
// Written and read back through the same code path a real file takes, including
// the two things that trip ID3 writers: synchsafe sizes and UTF-16 text.
{
  const tags = { title: 'Piano sketch — 04', artist: 'Dr Okafor', album: 'Rehearsals' }
  const id3 = buildId3(tags)

  assert.equal(String.fromCharCode(id3[0], id3[1], id3[2]), 'ID3')
  assert.equal(id3[3], 3, 'v2.3')
  // Synchsafe: no size byte may have its top bit set, which is what keeps a tag
  // from ever looking like an MP3 frame sync.
  for (const i of [6, 7, 8, 9]) assert.ok(id3[i] < 0x80, `size byte ${i} is synchsafe`)
  const declared = (id3[6] << 21) | (id3[7] << 14) | (id3[8] << 7) | id3[9]
  assert.equal(declared, id3.length - 10, 'declared size matches the frames written')

  assert.deepEqual(readTags(id3), tags, 'round-trips, em dash and all')

  // A file with no tags produces no block at all, rather than an empty one.
  assert.equal(buildId3({}).length, 0)
  assert.deepEqual(readTags(new Uint8Array([1, 2, 3])), {}, 'garbage in, no tags out — never throws')
  assert.deepEqual(readTags(new Uint8Array(0)), {})

  assert.deepEqual(
    vorbisComments(tags),
    ['TITLE=Piano sketch — 04', 'ARTIST=Dr Okafor', 'ALBUM=Rehearsals'],
    'Vorbis comments for the FLAC/Opus side',
  )
  assert.deepEqual(vorbisComments({}), [])

  console.log('✓ tags — ID3v2.3 synchsafe sizes, UTF-16 text, round trip, tolerant reads')
}

// ── CRC32 ────────────────────────────────────────────────────────────────────
{
  // The canonical check value for "123456789" (ZIP/PKZIP CRC-32).
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
  assert.equal(crc32(new Uint8Array(0)), 0)
  console.log('✓ crc32 — canonical check value')
}

// ── ZIP ──────────────────────────────────────────────────────────────────────
{
  const files = [
    { name: 'interview.wav', blob: new Blob([new Uint8Array([1, 2, 3, 4, 5])]) },
    { name: 'piano sketch — 04.wav', blob: new Blob([new TextEncoder().encode('hello converter')]) },
  ]
  const zip = await createZip(files)
  const bytes = Buffer.from(await zip.arrayBuffer())

  const dir = mkdtempSync(join(tmpdir(), 'uniconv-'))
  const path = join(dir, 'out.zip')
  writeFileSync(path, bytes)

  // `unzip -t` validates every CRC and the central directory.
  const test = execFileSync('unzip', ['-t', path], { encoding: 'utf8' })
  assert.match(test, /No errors detected in compressed data/)

  // Names and payloads are checked with python's zipfile rather than `unzip -Z`,
  // whose listing transliterates non-ASCII names to '?' depending on the shell
  // locale — that's the reader's console output, not what we wrote.
  const probe = execFileSync(
    'python3',
    [
      '-c',
      [
        'import sys, zipfile',
        'z = zipfile.ZipFile(sys.argv[1])',
        'print("|".join(z.namelist()))',
        'print(z.read(z.namelist()[1]).decode())',
      ].join('\n'),
      path,
    ],
    { encoding: 'utf8' },
  ).split('\n')

  assert.deepEqual(probe[0].split('|'), ['interview.wav', 'piano sketch — 04.wav'], 'names survive, UTF-8 included')
  assert.equal(probe[1], 'hello converter', 'stored bytes come back unchanged')

  console.log('✓ zip — unzip -t passes, names and bytes round-trip')
}

// ── Video sizing ─────────────────────────────────────────────────────────────
{
  assert.deepEqual(targetFrameSize(1920, 1080, 720), { width: 1280, height: 720 }, 'landscape caps the height')
  assert.deepEqual(targetFrameSize(1080, 1920, 720), { width: 720, height: 1280 }, 'portrait caps the width — a phone clip stays upright')
  assert.deepEqual(targetFrameSize(640, 480, 1080), { width: 640, height: 480 }, 'never scales up')
  assert.deepEqual(targetFrameSize(1921, 1081, 'source'), { width: 1922, height: 1082 }, 'odd dimensions round to even for the macroblock grid')
  assert.ok(
    videoBitrate(3840, 2160, 30, 'balanced') > videoBitrate(1280, 720, 30, 'balanced'),
    '4K gets a bigger budget than 720p at the same quality',
  )
  assert.ok(
    videoBitrate(1280, 720, 60, 'balanced') > videoBitrate(1280, 720, 30, 'balanced'),
    'twice the frame rate asks for more bits',
  )
  assert.ok(videoBitrate(64, 64, 1, 'small') >= 200_000, 'a postage stamp still gets a watchable floor')
  assert.ok(videoBitrate(7680, 4320, 60, 'high') <= 60_000_000, '8K/60 is capped to something an encoder will accept')
  console.log('✓ video — frame sizing keeps orientation, bitrate scales with pixels and rate')
}

// ── MP4 movie: muxer → demuxer ───────────────────────────────────────────────
// The one place in this suite where our reader checking our writer is the point
// rather than a cop-out: mp4read.ts exists to take apart files mp4.ts-shaped
// code produced, and the sample tables are cross-compressed against five
// different axes, so a writer and a reader that disagree about any of them show
// up here as wrong bytes at a wrong offset. The frame payloads are recognisable
// so a mistake lands as "sample 3 starts at the wrong byte", not a vague fail.
{
  const frames = [9, 5, 7, 4, 6].map((size, i) => new Uint8Array(size).fill(i + 1))
  const step = Math.round(TIMESCALE / 25) // 25 fps
  const samples = frames.map((bytes, i) => ({
    bytes,
    timestamp: i * step,
    duration: step,
    keyframe: i === 0 || i === 3,
  }))
  const avcC = new Uint8Array([1, 0x64, 0x00, 0x1f, 0xff, 0xe1, 0, 4, 0x67, 0x64, 0, 0x1f, 1, 0, 4, 0x68, 0xee, 0x3c, 0x80])
  const aacFrames = [3, 3, 3].map((size, i) => new Uint8Array(size).fill(0xa0 + i))
  const asc = new Uint8Array([0x12, 0x10])

  const movie = buildMp4Movie({
    video: { samples, description: avcC, width: 640, height: 480 },
    audio: { frames: aacFrames, description: asc, sampleRate: 48000, channels: 2, samplesPerFrame: 1024 },
  })
  const view = new DataView(movie.buffer, movie.byteOffset, movie.byteLength)

  assert.equal(boxTypeAt(movie, 0), 'ftyp')
  const ftypSize = view.getUint32(0)
  assert.equal(String.fromCharCode(...movie.slice(8, 12)), 'isom', 'major brand')
  assert.equal(boxTypeAt(movie, ftypSize), 'moov')
  const moovSize = view.getUint32(ftypSize)
  assert.equal(boxTypeAt(movie, ftypSize + moovSize), 'mdat', 'moov precedes mdat, so a player can start without seeking to the end')

  const text = new TextDecoder('latin1').decode(movie)
  for (const type of ['mvhd', 'tkhd', 'vmhd', 'smhd', 'avc1', 'avcC', 'mp4a', 'esds', 'stss', 'stts', 'stsc', 'stsz', 'stco']) {
    assert.ok(text.includes(type), `${type} is present`)
  }
  assert.ok(!text.includes('ctts'), 'no composition offsets when presentation order is decode order')

  const tracks = readMp4(movie)
  assert.equal(tracks.length, 2, 'two tracks')

  const video = tracks.find((t) => t.kind === 'video')
  assert.ok(video, 'video track found by its vide handler')
  assert.equal(video.width, 640)
  assert.equal(video.height, 480)
  assert.equal(video.codec, 'avc1.64001f', 'codec string built from the avcC profile/constraint/level')
  assert.deepEqual([...video.description], [...avcC], 'avcC round-trips byte for byte')
  assert.equal(video.samples.length, 5)
  assert.deepEqual(video.samples.map((s) => s.size), [9, 5, 7, 4, 6], 'stsz sizes')
  assert.deepEqual(video.samples.map((s) => s.sync), [true, false, false, true, false], 'stss keyframes')
  assert.deepEqual(video.samples.map((s) => s.pts), [0, step, step * 2, step * 3, step * 4], 'stts times')

  // The offsets are the real test: each has to land on that frame's own bytes.
  for (let i = 0; i < frames.length; i++) {
    const at = video.samples[i].offset
    assert.deepEqual(
      [...movie.slice(at, at + video.samples[i].size)],
      [...frames[i]],
      `sample ${i} starts at the byte its stco/stsz say it does`,
    )
  }

  const audio = tracks.find((t) => t.kind === 'audio')
  assert.ok(audio, 'audio track found by its soun handler')
  assert.equal(audio.sampleRate, 48000, '16.16 fixed-point sample rate')
  assert.equal(audio.channels, 2)
  assert.deepEqual([...audio.description], [...asc], 'AudioSpecificConfig dug back out of the nested esds descriptors')
  assert.equal(audio.samples.length, 3)
  const firstAudio = audio.samples[0].offset
  assert.equal(movie[firstAudio], 0xa0, 'the audio track\'s own chunk offset points past the video frames')

  // A variable-frame-rate clip must not collapse into one stts run.
  const vfr = buildMp4Movie({
    video: {
      samples: [
        { bytes: new Uint8Array(2), timestamp: 0, duration: 1000, keyframe: true },
        { bytes: new Uint8Array(2), timestamp: 1000, duration: 9000, keyframe: true },
      ],
      description: avcC,
      width: 320,
      height: 240,
    },
    audio: null,
  })
  const vfrTrack = readMp4(vfr)[0]
  assert.deepEqual(vfrTrack.samples.map((s) => s.duration), [1000, 9000], 'run-length durations survive a rate change')
  assert.ok(!new TextDecoder('latin1').decode(vfr).includes('stss'), 'stss is omitted when every frame is a keyframe')

  console.log('✓ mp4 movie — box order, both tracks, sample offsets land on their own frames')
}

// ── MP4 reader against the audio writer ──────────────────────────────────────
// mp4.ts's output is the one MP4 in this project an independent reader has
// already blessed (the box-tree checks above, and an <audio> round trip in the
// browser), so reading it back is the closest thing to an external fixture the
// demuxer can get without shipping a binary.
{
  const frames = Array.from({ length: 7 }, (_, i) => new Uint8Array(4).fill(i + 1))
  const description = new Uint8Array([0x12, 0x10])
  const m4a = buildMp4({ frames, description, sampleRate: 44100, channels: 2, samplesPerFrame: 1024, priming: 2112 })

  const tracks = readMp4(m4a)
  assert.equal(tracks.length, 1, 'one track in an M4A')
  assert.equal(tracks[0].kind, 'audio')
  assert.equal(tracks[0].codec, 'mp4a.40.2')
  assert.equal(tracks[0].sampleRate, 44100)
  assert.equal(tracks[0].samples.length, 7)
  assert.deepEqual([...tracks[0].description], [...description])
  const at = tracks[0].samples[3].offset
  assert.deepEqual([...m4a.slice(at, at + 4)], [4, 4, 4, 4], 'the fourth frame is where the tables say')

  assert.throws(
    () => readMp4(new Uint8Array([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70])),
    /no MP4 movie header/,
    'a file with no moov is refused by name rather than parsed into nothing',
  )

  console.log('✓ mp4 reader — reads the M4A writer\'s own output back')
}

console.log(skipped > 0
  ? `\nself-tests passed — ${skipped} macOS-only check(s) skipped, see the warnings above`
  : '\nall self-tests passed')
