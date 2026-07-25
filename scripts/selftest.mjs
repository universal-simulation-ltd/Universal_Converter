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
import { createZip, crc32 } from '../src/lib/zip.ts'

// A 1-second 440 Hz tone, the input for the encoder round-trips below.
function tone(sampleRate = 44100, seconds = 1) {
  const samples = new Float32Array(sampleRate * seconds)
  for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5
  return samples
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
  const info = execFileSync('afinfo', [path], { encoding: 'utf8' })
  assert.match(info, /44100 Hz/, 'afinfo reads the 80-bit extended sample rate back as 44100')
  assert.match(info, /2 ch/, 'afinfo sees two channels')
  assert.match(info, /estimated duration: 1\.0+ sec/, 'one second of audio')

  console.log('✓ aiff — afinfo reads rate, channels and duration back')
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
  const info = execFileSync('afinfo', [path], { encoding: 'utf8' })
  assert.match(info, /MPEG.*Layer 3|\.mp3/i, 'afinfo recognises it as MPEG audio')
  assert.match(info, /44100 Hz/, 'sample rate survives')

  await assert.rejects(
    () => encodeMp3([samples], 96000, 192),
    /96000 Hz/,
    'an unsupported LAME rate is refused with a message naming it',
  )

  console.log('✓ mp3 — LAME output is real MPEG audio afinfo can read')
}

// ── Image sizing ─────────────────────────────────────────────────────────────
{
  assert.deepEqual(targetSize(4000, 3000, 1920), { width: 1920, height: 1440 }, 'landscape fits the long edge')
  assert.deepEqual(targetSize(3000, 4000, 1920), { width: 1440, height: 1920 }, 'portrait fits the long edge')
  assert.deepEqual(targetSize(800, 600, 1920), { width: 800, height: 600 }, 'never scales up')
  assert.deepEqual(targetSize(800, 600, 'source'), { width: 800, height: 600 }, 'source keeps size')
  console.log('✓ image — resize keeps aspect ratio and never upscales')
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

console.log('\nall self-tests passed')
