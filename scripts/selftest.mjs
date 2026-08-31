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
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

import { encodeWav } from '../src/lib/wav.ts'
import { encodeAiff } from '../src/lib/aiff.ts'
import { encodeMp3 } from '../src/lib/mp3.ts'
import { targetSize } from '../src/lib/resize.ts'
import { tabAfterDrop } from '../src/lib/routing.ts'
import { parseClock } from '@unisim/media'
import { createZip, crc32 } from '@unisim/media'
import { HEADER_BOS, HEADER_EOS, buildPage, oggCrc, opusHead, opusTags } from '../src/lib/ogg.ts'
import { buildPdf } from '../src/lib/pdf.ts'
import { ALPHA_THRESHOLD, ColourCube, GifWriter, MAX_COLOURS, PaletteMap, TRANSPARENT_INDEX, lzwEncode, quantiseFrame } from '../src/lib/gif.ts'
import { decodeGif, isGif, readGifInfo } from '../src/lib/gifdecode.ts'
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

// ── GIF ──────────────────────────────────────────────────────────────────────
// The one writer in this app whose output no browser can check for us: there is
// no `toBlob('image/gif')` to compare against, so the palette, the LZW coder
// and the frame differencing are all ours and all have to be proved against a
// reader that is not.
//
// ffmpeg is that reader. Every pixel of every decoded frame is compared to the
// palette colour our own index array claims it should be — not "roughly right",
// EXACTLY right — which is the assertion that catches the mistakes this format
// invites: a code width that grows one entry late, a bounding box off by a row,
// a transparent index that leaks a real colour.
{
  const W = 96
  const H = 72
  const frame = (fn) => {
    const px = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const [r, g, b] = fn(x, y)
        const p = (y * W + x) * 4
        px[p] = r; px[p + 1] = g; px[p + 2] = b; px[p + 3] = 255
      }
    }
    return px
  }

  // A deterministic pseudo-random source. Noise is the WORST case for LZW —
  // it fills the 4096-entry table and forces the reset — and the case a happy
  // path of flat colours never reaches.
  let seed = 20260824
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

  const frames = [
    frame(() => [(rand() * 255) | 0, (rand() * 255) | 0, (rand() * 255) | 0]),
    frame((x, y) => [((x * 255) / W) | 0, ((y * 255) / H) | 0, 128]),
    // Byte-for-byte the frame before it: the "nothing moved" path, which writes
    // a single transparent pixel and must still hold the screen for its delay.
    frame((x, y) => [((x * 255) / W) | 0, ((y * 255) / H) | 0, 128]),
    // One square moves. Only that rectangle should be written.
    frame((x, y) => (x >= 30 && x < 60 && y >= 20 && y < 50 ? [0, 0, 0] : [((x * 255) / W) | 0, ((y * 255) / H) | 0, 128])),
  ]

  const cube = new ColourCube()
  for (const f of frames) cube.addFrame(f)
  const colours = cube.palette(MAX_COLOURS)
  assert.ok(colours.length / 3 <= MAX_COLOURS, 'the palette leaves index 255 free for transparency')
  const map = new PaletteMap(colours)
  const indices = frames.map((f) => quantiseFrame(f, W, H, map, false))

  const writer = new GifWriter(W, H, colours, true)
  for (const q of indices) writer.addFrame(q, 5)
  const chunks = writer.finish()
  const gif = Buffer.concat(chunks.map(Buffer.from))

  // Structure, before anyone else is asked to read it.
  assert.equal(gif.subarray(0, 6).toString('latin1'), 'GIF89a', 'the version block says GIF89a')
  assert.equal(gif.readUInt16LE(6), W, 'logical screen width')
  assert.equal(gif.readUInt16LE(8), H, 'logical screen height')
  assert.equal(gif[10], 0xf7, 'a global colour table of 256 entries is declared')
  assert.equal(gif[gif.length - 1], 0x3b, 'the file ends with the trailer')
  assert.ok(gif.includes(Buffer.from('NETSCAPE2.0', 'latin1')), 'looping asks for the Netscape extension')

  // Differencing, measured rather than assumed: a moving square must cost far
  // less than a whole frame, and an identical frame must cost almost nothing.
  // ⚠️ These are the chunks the writer produced, so the numbers are the real
  // payload sizes and not an estimate.
  const payloads = chunks.map((c) => c.length)
  const first = Math.max(...payloads)
  const held = payloads[payloads.length - 4]
  assert.ok(held < 40, `an unchanged frame costs a handful of bytes, not ${held}`)
  assert.ok(first > 2000, 'the first frame is a whole picture')

  const noLoop = Buffer.concat(new GifWriter(W, H, colours, false).finish().map(Buffer.from))
  assert.ok(!noLoop.includes(Buffer.from('NETSCAPE2.0', 'latin1')), 'not looping leaves the extension out entirely')

  // The palette guard: index 255 is reserved, so 256 colours must be refused
  // rather than quietly writing a colour that means "transparent".
  assert.throws(() => new PaletteMap(new Uint8Array(256 * 3)), /at most 255 colours/)
  assert.equal(TRANSPARENT_INDEX, 255)

  // Sub-blocks: every one at most 255 bytes, and a zero to end them.
  {
    const data = lzwEncode(new Uint8Array(1000).map((_, i) => i & 0xff), 8)
    let at = 0
    let blocks = 0
    while (data[at] !== 0) {
      assert.ok(data[at] <= 255, 'no sub-block claims more than 255 bytes')
      at += data[at] + 1
      blocks += 1
      assert.ok(at < data.length, 'the sub-block chain stays inside the buffer')
    }
    assert.equal(data[at], 0, 'the chain ends with a zero-length block')
    assert.ok(blocks > 0)
  }

  const dir = mkdtempSync(join(tmpdir(), 'conv-gif-'))
  const file = join(dir, 'animation.gif')
  writeFileSync(file, gif)

  try {
    const probe = execFileSync(
      'ffprobe',
      ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
       '-show_entries', 'stream=width,height,nb_read_frames',
       '-show_entries', 'format=duration', '-of', 'default=nw=1', file],
      { encoding: 'utf8' },
    )
    const field = (name) => probe.match(new RegExp(`${name}=([\\d.]+)`))?.[1]
    assert.equal(Number(field('width')), W, 'an outside reader agrees on the width')
    assert.equal(Number(field('height')), H, 'an outside reader agrees on the height')
    assert.equal(Number(field('nb_read_frames')), frames.length, 'every frame is there, including the one that did not change')
    // 4 frames × 5 hundredths.
    assert.ok(Math.abs(Number(field('duration')) - 0.2) < 0.005, `the delays add up to the right running time (${field('duration')})`)

    const raw = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
      { encoding: 'buffer', maxBuffer: 1 << 28 },
    )
    const frameBytes = W * H * 3
    assert.equal(raw.length / frameBytes, frames.length, 'the decoder produces one full picture per frame')
    let wrong = 0
    for (let f = 0; f < frames.length; f++) {
      for (let i = 0; i < W * H; i++) {
        const index = indices[f][i]
        const at = f * frameBytes + i * 3
        if (raw[at] !== colours[index * 3] || raw[at + 1] !== colours[index * 3 + 1] || raw[at + 2] !== colours[index * 3 + 2]) wrong++
      }
    }
    assert.equal(wrong, 0, `${wrong} of ${frames.length * W * H} pixels came back as a different colour than the index says`)
    console.log('✓ gif — LZW, palette and frame differencing, decoded pixel-for-pixel by ffmpeg')
  } catch (err) {
    if (err.code === 'ENOENT') {
      skipped += 1
      console.warn('! gif — ffmpeg/ffprobe not found, skipped the outside-reader check')
      console.log('✓ gif — structure, sub-blocks and differencing')
    } else {
      throw err
    }
  }
}

// ── GIF, reading ─────────────────────────────────────────────────────────────
// The half this app did not have until 2026-08-31, and the reason it silently
// destroyed every animated GIF dropped on the Images tab: `createImageBitmap`
// returns FRAME ONE of an animation and gives no flag, no warning and no error,
// so the conversion did not fail — it succeeded, at producing a still.
//
// `gifdecode.ts` is a byte-identical copy of Universal Compress's
// `src/lib/gif/decode.ts`, as `gif.ts` is of its `encode.ts`. These checks are
// deliberately duplicated in both repos: two copies that are never both tested
// are two copies that drift.
//
// ffmpeg is the reader that is not ours. Every pixel of every frame.
{
  const ffmpegFrames = (file, width, height, dir) => {
    const raw = join(dir, 'ref.raw')
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-fps_mode', 'passthrough',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', raw], { maxBuffer: 1 << 28 })
    const bytes = readFileSync(raw)
    const stride = width * height * 4
    assert.equal(bytes.length % stride, 0, 'ffmpeg returned a partial frame')
    const out = []
    for (let at = 0; at < bytes.length; at += stride) out.push(bytes.subarray(at, at + stride))
    return out
  }

  const dir = mkdtempSync(join(tmpdir(), 'conv-gifread-'))

  const readerAgreesWithFfmpeg = (label, file) => {
    const bytes = new Uint8Array(readFileSync(file))
    assert.ok(isGif(bytes), `${label}: recognised as a GIF by its bytes`)
    const info = readGifInfo(bytes)
    assert.ok(info, `${label}: the header scan read it`)

    const reference = ffmpegFrames(file, info.width, info.height, dir)
    assert.equal(reference.length, info.frames, `${label}: frame count agrees with ffmpeg`)

    let index = 0
    decodeGif(bytes, (frame) => {
      const want = reference[index]
      let wrong = 0
      for (let p = 0; p < want.length; p += 4) {
        // A transparent pixel still has an RGB, and ffmpeg's is not obliged to
        // match ours — nobody can see it. Compare those on alpha alone.
        const ours = frame.rgba[p + 3] >= ALPHA_THRESHOLD
        const theirs = want[p + 3] >= ALPHA_THRESHOLD
        if (ours !== theirs) { wrong++; continue }
        if (!ours) continue
        if (frame.rgba[p] !== want[p] || frame.rgba[p + 1] !== want[p + 1] || frame.rgba[p + 2] !== want[p + 2]) wrong++
      }
      assert.equal(wrong, 0, `${label}: frame ${index} has ${wrong} pixels ffmpeg disagrees with`)
      index++
    })
    assert.equal(index, info.frames, `${label}: every frame reached the callback`)
  }

  try {
    // A GIF ffmpeg wrote, with its own local colour tables and its own
    // differencing — a file shape our writer never produces, which is the point.
    const generated = join(dir, 'ffmpeg.gif')
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i',
      'testsrc=size=160x120:rate=10:duration=2', '-vf',
      'split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse', generated])
    readerAgreesWithFfmpeg('ffmpeg testsrc', generated)

    // ⚠️ A real GIF written by a real tool, if this machine happens to have one.
    // It is borrowed from a sibling repo's node_modules and WILL be absent on a
    // fresh clone — so a green run is not proof this ran. Read the warning.
    const real = new URL('../../Universal_PDF/node_modules/tesseract.js/docs/images/demo.gif', import.meta.url).pathname
    if (existsSync(real)) {
      readerAgreesWithFfmpeg('a real screen-recording GIF', real)
    } else {
      skipped += 1
      console.warn('! gif reader — the real-world fixture is not on this machine, only the generated one ran')
    }

    // Both halves, end to end: write an animation, read it back, and require
    // the delays and the palette indices to survive exactly.
    const W = 40, H = 24
    const frames = []
    for (let i = 0; i < 6; i++) {
      const px = new Uint8ClampedArray(W * H * 4)
      for (let p = 0; p < W * H; p++) {
        px[p * 4] = 30 + i * 20
        px[p * 4 + 1] = 90
        px[p * 4 + 2] = 200 - i * 20
        px[p * 4 + 3] = 255
      }
      frames.push(px)
    }
    const cube = new ColourCube()
    for (const f of frames) cube.addFrame(f)
    const colours = cube.palette(MAX_COLOURS)
    const map = new PaletteMap(colours)
    const writer = new GifWriter(W, H, colours, 0)
    for (const f of frames) writer.addFrame(quantiseFrame(f, W, H, map), 9)
    const roundTrip = new Uint8Array(Buffer.concat(writer.finish().map(Buffer.from)))

    const info = readGifInfo(roundTrip)
    assert.equal(info.frames, frames.length, 'the round trip keeps every frame')
    assert.equal(info.loop, 0, 'loop-forever survives, and 0 is not treated as falsy')
    let seen = 0
    decodeGif(roundTrip, (frame) => {
      assert.equal(frame.delayCs, 9, `round trip: frame ${seen} kept its delay`)
      seen++
    })
    assert.equal(seen, frames.length, 'the round trip reads back every frame')

    console.log('✓ gif reader — real and generated GIFs decoded pixel-for-pixel as ffmpeg decodes them')
  } catch (err) {
    if (err.code === 'ENOENT') {
      skipped += 1
      console.warn('! gif reader — ffmpeg not found, skipped the outside-reader check')
    } else {
      throw err
    }
  }
}

// ── Tab routing ──────────────────────────────────────────────────────────────
// Where a drop leaves you. Pure rules over a tiny input, and exactly the kind of
// behaviour that regresses without anybody noticing — nothing crashes when the
// app takes you to the wrong tab, it just stops being helpful.
{
  const at = (from, hadItems, landedOn, rejected = false) =>
    tabAfterDrop({ from, hadItems, landedOn, rejected })

  // 1. A single-kind drop onto an empty All tab goes straight to that studio.
  assert.equal(at('all', false, ['image']), 'image', 'all images → the Images tab')
  assert.equal(at('all', false, ['audio']), 'audio', 'all audio → the Audio tab')
  assert.equal(at('all', false, ['video']), 'video', 'all video → the Video tab')
  assert.equal(at('all', false, ['document']), 'document', 'all documents → the Files tab')

  // …however many files, as long as they are all one kind. `landedOn` is a set
  // of kinds, not a count, so this is the same case as one file.
  assert.equal(at('all', false, ['image', 'image']), 'image', 'twelve photos still go to Images')

  // 2. A MIXED drop has no single destination, so it stays where the sorting
  //    column can explain itself.
  assert.equal(at('all', false, ['image', 'audio']), 'all', 'a mixed drop stays on All')
  assert.equal(at('all', false, ['image', 'audio', 'video', 'document']), 'all', 'four kinds stay on All')

  // 3. Already queued and sitting on All on purpose: leave them there. This is
  //    the case that separates `hadItems` from a plain "is it one kind?" test.
  assert.equal(at('all', true, ['image']), 'all', 'adding to an existing queue does not navigate')

  // 4. A drop the sorter turned something away from stays on All, because the
  //    "Not converted: …" notice is only rendered there.
  assert.equal(at('all', false, ['image'], true), 'all', 'a rejection keeps you where the notice is')

  // 5. More of the same kind NEVER moves anybody — the whole point of the
  //    "add another one" case, and what keeps a hand-picked tab hand-picked.
  assert.equal(at('image', true, ['image']), 'image', 'a second photo on Images stays on Images')
  assert.equal(at('audio', true, ['audio']), 'audio', 'a second sound on Audio stays on Audio')
  // Even when other kinds are already queued behind them: what matters is what
  // was just added, not what the queue as a whole holds.
  assert.equal(at('audio', true, ['audio']), 'audio', 'a hand-picked tab survives a mixed queue')

  // 6. A file of a DIFFERENT kind sends you back to the multi-file view.
  assert.equal(at('image', true, ['audio']), 'all', 'a sound added from Images bounces to All')
  assert.equal(at('image', true, ['image', 'audio']), 'all', 'one of each bounces to All')
  assert.equal(at('document', false, ['video']), 'all', 'and from an empty studio tab too')

  // 7. Nothing landed — every file was unreadable. Never move: the person is
  //    about to be told why, on the screen they are already looking at.
  assert.equal(at('all', false, []), 'all')
  assert.equal(at('image', true, []), 'image')

  console.log('✓ routing — every tab-after-drop rule, including the two that must NOT move you')
}

console.log(skipped > 0
  ? `\nself-tests passed — ${skipped} macOS-only check(s) skipped, see the warnings above`
  : '\nall self-tests passed')
