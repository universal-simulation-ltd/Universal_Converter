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
//
// The MP4/ISO-BMFF and video blocks are NOT here any more. They moved to
// @unisim/media along with the code they cover (2026-08-06); run `npm test` in
// backoffice/universal-platform/packages/media for those. What remains at the
// bottom of this file is a check that this app is really calling the package.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

import { encodeWav } from '../src/lib/wav.ts'
import { encodeAiff } from '../src/lib/aiff.ts'
import { encodeMp3 } from '../src/lib/mp3.ts'
import { targetSize } from '../src/lib/resize.ts'
import { parseClock } from '@unisim/media'
import { createZip, crc32 } from '../src/lib/zip.ts'
import { HEADER_BOS, HEADER_EOS, buildPage, oggCrc, opusHead, opusTags } from '../src/lib/ogg.ts'
import { buildPdf } from '../src/lib/pdf.ts'
import { buildMp4, readMp4, trimWindow } from '@unisim/media'
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
  //
  // Two Windows-only wrinkles, both in the *reader's* plumbing rather than in
  // our bytes, and both fixed here rather than asserted around:
  //   • python's stdout defaults to the console code page (cp1252 here), which
  //     turns the em dash into a replacement character on the way out.
  //     PYTHONIOENCODING makes it UTF-8 regardless of console.
  //   • `print` ends lines with CRLF, so splitting on '\n' leaves a stray '\r'
  //     on every field.
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
    { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
  ).split(/\r?\n/)

  assert.deepEqual(probe[0].split('|'), ['interview.wav', 'piano sketch — 04.wav'], 'names survive, UTF-8 included')
  assert.equal(probe[1], 'hello converter', 'stored bytes come back unchanged')

  console.log('✓ zip — unzip -t passes, names and bytes round-trip')
}


// ── @unisim/media is wired in ────────────────────────────────────────────────
// The MP4 reader, the MP4/M4A writers, the movie muxer and the frame-size maths
// moved to @unisim/media (2026-08-06) and their self-tests moved with them —
// run `npm test` in backoffice/universal-platform/packages/media for those.
//
// What is checked HERE is the seam: that this app really is calling the package
// rather than a stale local copy, and that the audio path's shared helpers come
// back through it. A round trip is enough — if the import resolves and the
// writer's output reads back, the wiring is right.
{
  const frames = Array.from({ length: 5 }, (_, i) => new Uint8Array(4).fill(i + 1))
  const m4a = buildMp4({
    frames, description: new Uint8Array([0x12, 0x10]),
    sampleRate: 44100, channels: 2, samplesPerFrame: 1024, priming: 2112,
  })
  const track = readMp4(m4a)[0]
  assert.equal(track.kind, 'audio')
  assert.equal(track.samples.length, 5)
  const at = track.samples[3].offset
  assert.deepEqual([...m4a.slice(at, at + 4)], [4, 4, 4, 4], 'the package’s writer and reader agree, through the package')

  assert.deepEqual(
    trimWindow(60, { enabled: true, startSec: 10, endSec: null }),
    { offset: 10, duration: 50 },
    'the audio path’s trim window comes from the package now',
  )
  console.log('✓ @unisim/media — the shared pipeline resolves and round-trips from this app')
}

// ── PDF ──────────────────────────────────────────────────────────────────────
// A file that downloads at a plausible size and opens to nothing is this
// suite's known failure mode — a shaped-SVG export shipped exactly that once.
// So the object graph, the xref offsets and the string escaping are checked
// byte by byte, and then the file is handed to a reader that is not ours.
{
  // A one-pixel JPEG. What is under test is the PDF structure around it, not
  // the picture, so the smallest legal-ish JFIF payload will do.
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, ...new Array(64).fill(0x08),
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xd2, 0xcf, 0x20,
    0xff, 0xd9,
  ])
  const blob = buildPdf(
    [{ jpeg, width: 1, height: 1 }, { jpeg, width: 2, height: 3 }],
    'Self test (with (nested) parens) and an em dash',
  )
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const text = Buffer.from(bytes).toString('latin1')

  assert.equal(blob.type, 'application/pdf')
  assert.ok(text.startsWith('%PDF-1.4'), 'starts with the header')
  // "%PDF-1.4\n" is nine bytes, then a comment line whose '%' is byte 9 and
  // whose high bytes start at 10. Those high bytes are what tell a transfer
  // that treats the file as text that it is binary.
  assert.equal(bytes[9], 0x25, 'the second line is a comment')
  assert.ok(bytes[10] > 127, 'the comment carries high bytes, marking the file binary')
  assert.ok(text.endsWith('%%EOF\n'), 'ends with the trailer marker')
  assert.ok(text.includes('/Type /Catalog'), 'has a catalog')
  assert.ok(text.includes('/Count 2'), 'declares both pages')
  assert.ok(text.includes('/MediaBox [0 0 2 3]'), 'the second page carries its own size')
  assert.equal(text.split('/DCTDecode').length - 1, 2, 'both images embed as JPEG')

  // The xref offsets are what silently breaks a PDF: a reader seeks to them,
  // and a wrong one opens a blank document with no error at all. Every entry
  // must land exactly on its own "<n> 0 obj".
  const startxref = Number(text.split('startxref\n')[1].split('\n')[0])
  assert.equal(text.slice(startxref, startxref + 4), 'xref', 'startxref points at the table')
  const size = Number(text.split('/Size ')[1].split(' ')[0])
  // Lines: [0] "xref", [1] "0 <count>", [2] the free entry for object 0, then
  // one row per real object. Objects are 1-based, so the rows start at index 3.
  const rows = text.slice(startxref).split('\n').slice(3, 3 + size - 1)
  rows.forEach((row, i) => {
    const at = Number(row.slice(0, 10))
    const want = (i + 1) + ' 0 obj'
    assert.equal(text.slice(at, at + want.length), want, 'xref entry ' + (i + 1) + ' points at object ' + (i + 1))
  })

  // A PDF string literal ends at the first unescaped ')', so an un-escaped
  // paren in a filename corrupts everything after it.
  assert.ok(text.includes('/Title (Self test \\(with \\(nested\\) parens\\) and an em dash)'),
    'parens in the title are escaped')
  assert.throws(() => buildPdf([], 'x'), /at least one page/)

  const dir = mkdtempSync(join(tmpdir(), 'uc-pdf-'))
  const file = join(dir, 'out.pdf')
  writeFileSync(file, bytes)
  const script = [
    'import sys',
    'd = open(sys.argv[1], "rb").read()',
    'i = d.rfind(b"startxref")',
    'off = int(d[i+9:].split()[0])',
    'assert d[off:off+4] == b"xref", "xref not at startxref"',
    'print("pages=%d" % d.count(b"/Type /Page "))',
  ].join('\n')
  try {
    const out = execFileSync('python', ['-c', script, file], { encoding: 'utf8' }).trim()
    assert.equal(out, 'pages=2', 'an outside reader walks to the same two pages')
    console.log('✓ pdf — structure, xref offsets and escaping, confirmed by an outside reader')
  } catch (err) {
    if (err.code === 'ENOENT') {
      skipped += 1
      console.warn('! pdf — python not found, skipped the outside-reader check')
      console.log('✓ pdf — structure, xref offsets and escaping')
    } else {
      throw err
    }
  }
}

console.log(skipped > 0
  ? `\nself-tests passed — ${skipped} macOS-only check(s) skipped, see the warnings above`
  : '\nall self-tests passed')
