// Self-test for the two pure byte-level modules — the WAV writer and the ZIP
// writer. Both produce files other software has to read, so they're checked
// against the real format here rather than only in a browser.
//
//   node scripts/selftest.mjs
//
// Node 24 strips the TypeScript types on import, so the source is tested
// directly (no build step). The ZIP assertion shells out to `unzip`, which is
// the point: a third-party reader must accept what we write.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

import { encodeWav } from '../src/lib/wav.ts'
import { createZip, crc32 } from '../src/lib/zip.ts'

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
