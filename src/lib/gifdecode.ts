/**
 * GIF87a/89a — the reader.
 *
 * ⚠️ **THIS FILE IS SHARED VERBATIM BY TWO REPOS. Keep it that way.**
 * `Universal_Compress/src/lib/gif/decode.ts` and
 * `Universal_Converter/src/lib/gifdecode.ts` are byte-identical copies, as are
 * its twin `encode.ts` / `gif.ts`. Copy any change to the other repo in the
 * same session; when a third consumer appears, lift the pair into
 * `@unisim/media` instead — noted in the backlog.
 *
 * The suite had a GIF *writer* long before it had a reader, because until
 * recently nothing needed one: the converter only ever wrote GIFs, out of video
 * frames it had decoded some other way.
 *
 * Doing anything to a GIF that already exists needs the other half, and the
 * browser will not supply it. `createImageBitmap()` on an animated GIF hands
 * back **frame one and nothing else** — silently, with no flag to say an
 * animation went in. That is exactly how Universal Compress turned a 4.2 MB
 * animation into a 2 KB still and reported it as "−100%", the biggest saving on
 * the screen, for having destroyed the file. `<img>` animates but will not let
 * you read the frames; `ImageDecoder` can do it, but is absent from Safari,
 * which is a third of the traffic to a privacy-first web app. So: a reader.
 *
 * A leaf module, like its twin — no imports, no DOM, nothing but bytes in and
 * pixels out. That is what lets the GIF self-test run it under Node's type
 * stripping and check it against ffmpeg, which is the only way to know a codec
 * is right. "Our reader agrees with our writer" proves nothing.
 */

/** One decoded frame: the whole canvas, composited, not just this frame's rectangle. */
export interface GifFrame {
  /**
   * `width * height * 4` of RGBA.
   *
   * ⚠️ **The same buffer comes back every frame.** Copy it if you intend to
   * keep it — a 500-frame 800×600 GIF is 960 MB of pixels if every frame is
   * retained, which is a killed tab rather than a slow one. Every caller in
   * both apps consumes each frame and lets it go.
   */
  rgba: Uint8ClampedArray
  /** Hundredths of a second this frame is held. Already normalised — see `normaliseDelay`. */
  delayCs: number
  /** 0-based. */
  index: number
}

export interface GifInfo {
  width: number
  height: number
  /** How many image descriptors the file carries. 1 means a still. */
  frames: number
  /** `0` = loop forever, `n` = n times, `null` = no Netscape block, so play once. */
  loop: number | null
}

const EXTENSION = 0x21
const IMAGE_DESCRIPTOR = 0x2c
const TRAILER = 0x3b
const GRAPHIC_CONTROL = 0xf9
const APPLICATION = 0xff

/** Disposal method 3 — "restore to previous" — is the only one needing a saved canvas. */
const DISPOSE_RESTORE_PREVIOUS = 3
/** Disposal method 2 — "restore to background" — clears the frame's own rectangle. */
const DISPOSE_BACKGROUND = 2

/**
 * Is this a GIF at all?
 *
 * Bytes, not the file name and not `File.type`. Android's pickers and Windows
 * Explorer both hand over `application/octet-stream` often enough that trusting
 * either refuses files that work perfectly — the same reasoning `kinds.ts`
 * gives for putting the extension ahead of the MIME type.
 */
export function isGif(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 13 &&
    bytes[0] === 0x47 && // G
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x38 && // 8
    (bytes[4] === 0x37 || bytes[4] === 0x39) && // 7 | 9
    bytes[5] === 0x61 // a
  )
}

/**
 * Size, frame count and loop flag — **without decompressing a single pixel**.
 *
 * This walks the block chain and steps over each frame's LZW data by its
 * sub-block lengths, so it costs a scan of the file rather than a decode of it.
 * That is what makes it safe to call on every dropped file from `fillDetail`,
 * where the answer is wanted for the row's "· 48 frames" caption and for the
 * size estimate long before anybody presses Compress.
 *
 * Returns `null` for anything that isn't a readable GIF.
 */
export function readGifInfo(bytes: Uint8Array): GifInfo | null {
  try {
    return parse(bytes, null)
  } catch {
    return null
  }
}

/**
 * Every frame, composited onto the logical screen, handed to `onFrame` one at a
 * time.
 *
 * Streaming rather than returning an array, for the memory reason on
 * `GifFrame.rgba` above. Throws with a sentence a user could read if the file
 * is not a GIF or its block structure is broken.
 */
export function decodeGif(bytes: Uint8Array, onFrame: (frame: GifFrame) => void): GifInfo {
  return parse(bytes, onFrame)
}

/**
 * A GIF's delay field, as browsers actually treat it.
 *
 * ⚠️ **0 and 1 do not mean "fast".** Every engine silently rewrites a delay
 * below 2 hundredths to 10, a rule inherited from Netscape in the nineties and
 * never dropped, because uncapped delays let a GIF pin a CPU. Enormous numbers
 * of real GIFs are written with delay 0 and *look* like 10 fps as a result.
 *
 * Normalising on the way IN is what stops re-encoding from changing the speed
 * of the picture: read 0, write 0, and the output plays at the same 10 fps as
 * the input — but read 0 and write it as the 2 the encoder floors at, and a
 * ten-second animation comes out playing in two. The number this returns is
 * what the user has been watching.
 */
function normaliseDelay(raw: number): number {
  return raw < 2 ? 10 : raw
}

function parse(bytes: Uint8Array, onFrame: ((frame: GifFrame) => void) | null): GifInfo {
  if (!isGif(bytes)) throw new Error('This file does not start with a GIF header')

  // ── Logical screen descriptor ──
  const width = bytes[6] | (bytes[7] << 8)
  const height = bytes[8] | (bytes[9] << 8)
  const packed = bytes[10]
  if (width < 1 || height < 1) throw new Error('This GIF declares an empty canvas')

  let at = 13
  let globalTable: Uint8Array | null = null
  if (packed & 0x80) {
    const entries = 1 << ((packed & 0x07) + 1)
    globalTable = bytes.subarray(at, at + entries * 3)
    at += entries * 3
  }

  // Only allocated when we are actually decoding pixels — `readGifInfo` walks
  // the same blocks and must stay a scan, not a 4 MB allocation per dropped file.
  const canvas = onFrame ? new Uint8ClampedArray(width * height * 4) : null
  let saved: Uint8ClampedArray | null = null

  let frames = 0
  let loop: number | null = null

  // Graphic control extension state. It describes the NEXT image descriptor,
  // and is reset after each one so a frame with no GCE of its own does not
  // inherit the previous frame's delay and transparency.
  let delayCs = 10
  let transparentIndex = -1
  let disposal = 0

  while (at < bytes.length) {
    const block = bytes[at]

    if (block === TRAILER) break

    if (block === EXTENSION) {
      const label = bytes[at + 1]
      at += 2

      if (label === GRAPHIC_CONTROL) {
        // Fixed 4-byte payload, then the sub-block terminator.
        const flags = bytes[at + 1]
        delayCs = normaliseDelay(bytes[at + 2] | (bytes[at + 3] << 8))
        transparentIndex = flags & 0x01 ? bytes[at + 4] : -1
        disposal = (flags >> 2) & 0x07
        at = skipSubBlocks(bytes, at)
        continue
      }

      if (label === APPLICATION) {
        // NETSCAPE2.0 / ANIMEXTS1.0 both carry the loop count the same way:
        // an 11-byte identifier, then a sub-block of `01 <count lo> <count hi>`.
        const size = bytes[at]
        const name = latin1(bytes, at + 1, size)
        const after = at + 1 + size
        if ((name === 'NETSCAPE2.0' || name === 'ANIMEXTS1.0') && bytes[after] >= 3 && bytes[after + 1] === 1) {
          loop = bytes[after + 2] | (bytes[after + 3] << 8)
        }
        at = skipSubBlocks(bytes, at)
        continue
      }

      // Comment, plain text, or an extension from some tool we've never heard
      // of. Every one of them is length-prefixed the same way, which is the
      // whole point of GIF's sub-block chain — skip it and keep reading.
      at = skipSubBlocks(bytes, at)
      continue
    }

    if (block === IMAGE_DESCRIPTOR) {
      const left = bytes[at + 1] | (bytes[at + 2] << 8)
      const top = bytes[at + 3] | (bytes[at + 4] << 8)
      const fw = bytes[at + 5] | (bytes[at + 6] << 8)
      const fh = bytes[at + 7] | (bytes[at + 8] << 8)
      const imagePacked = bytes[at + 9]
      at += 10

      let table = globalTable
      if (imagePacked & 0x80) {
        const entries = 1 << ((imagePacked & 0x07) + 1)
        table = bytes.subarray(at, at + entries * 3)
        at += entries * 3
      }
      const interlaced = (imagePacked & 0x40) !== 0

      const minCodeSize = bytes[at]
      at += 1

      if (!onFrame) {
        // Counting only: step over the compressed data without touching it.
        at = skipSubBlocks(bytes, at)
        frames++
        delayCs = 10
        transparentIndex = -1
        disposal = 0
        continue
      }

      if (!table) throw new Error('This GIF has a frame with no colour table to read it with')

      const { data, next } = readSubBlocks(bytes, at)
      at = next

      // Disposal 3 restores what was on screen BEFORE this frame, so the copy
      // has to be taken now, while it still is.
      if (disposal === DISPOSE_RESTORE_PREVIOUS) {
        if (!saved) saved = new Uint8ClampedArray(canvas!.length)
        saved.set(canvas!)
      }

      const indices = lzwDecode(data, minCodeSize, fw * fh)
      draw(canvas!, width, height, indices, left, top, fw, fh, table, transparentIndex, interlaced)

      onFrame({ rgba: canvas!, delayCs, index: frames })
      frames++

      // ── Dispose, ready for the next frame ──
      if (disposal === DISPOSE_BACKGROUND) {
        // ⚠️ Clear to TRANSPARENT, not to the background colour the logical
        // screen descriptor names. The spec says background; no browser has
        // ever done that, and a GIF authored against browser behaviour — which
        // is all of them — comes out with a coloured rectangle stamped over it
        // if you follow the spec here instead.
        clearRect(canvas!, width, height, left, top, fw, fh)
      } else if (disposal === DISPOSE_RESTORE_PREVIOUS && saved) {
        canvas!.set(saved)
      }

      delayCs = 10
      transparentIndex = -1
      disposal = 0
      continue
    }

    // A byte that is none of the three legal block types. Plenty of real GIFs
    // carry junk between the last frame and the trailer; stopping here keeps
    // the frames we have rather than throwing away a file that mostly read.
    break
  }

  if (frames === 0) throw new Error('This GIF contains no frames')
  return { width, height, frames, loop }
}

/** One frame's palette indices, drawn into the composited canvas at its position. */
function draw(
  canvas: Uint8ClampedArray,
  width: number,
  height: number,
  indices: Uint8Array,
  left: number,
  top: number,
  fw: number,
  fh: number,
  table: Uint8Array,
  transparentIndex: number,
  interlaced: boolean,
): void {
  const colours = Math.floor(table.length / 3)

  for (let row = 0; row < fh; row++) {
    // Interlaced GIFs store their rows in four passes — every 8th from 0, then
    // every 8th from 4, every 4th from 2, every 2nd from 1. Reading them in
    // storage order is what produces the classic "venetian blind" corruption.
    const y = top + (interlaced ? interlacedRow(row, fh) : row)
    if (y < 0 || y >= height) continue

    const from = row * fw
    for (let x = 0; x < fw; x++) {
      const px = left + x
      if (px < 0 || px >= width) continue

      const index = indices[from + x]
      // Transparent pixels are not drawn at all: whatever the previous frame
      // left on the canvas shows through. That IS the compositing model, and
      // it is what makes frame differencing legal in the first place.
      if (index === transparentIndex) continue
      if (index >= colours) continue

      const to = (y * width + px) * 4
      canvas[to] = table[index * 3]
      canvas[to + 1] = table[index * 3 + 1]
      canvas[to + 2] = table[index * 3 + 2]
      canvas[to + 3] = 255
    }
  }
}

/**
 * Where storage row `row` of an interlaced frame actually belongs.
 *
 * ⚠️ **Each pass's row count is measured from its own STARTING row, not from
 * the top.** Pass two begins at row 4 and steps by 8, so it holds
 * `ceil((h - 4) / 8)` rows — not `ceil(h / 8)`, and emphatically not the
 * `ceil(h / 4)` that reads plausibly and is wrong. Getting these boundaries
 * wrong misplaces only the later passes, so the top of the picture is perfect
 * and the rest is shuffled: it looks like a damaged file rather than a bug, and
 * it survives any test whose fixture is a flat colour.
 */
function interlacedRow(row: number, fh: number): number {
  const first = Math.ceil(fh / 8)
  const second = Math.ceil(Math.max(0, fh - 4) / 8)
  const third = Math.ceil(Math.max(0, fh - 2) / 4)
  if (row < first) return row * 8
  if (row < first + second) return (row - first) * 8 + 4
  if (row < first + second + third) return (row - first - second) * 4 + 2
  return (row - first - second - third) * 2 + 1
}

function clearRect(
  canvas: Uint8ClampedArray,
  width: number,
  height: number,
  left: number,
  top: number,
  fw: number,
  fh: number,
): void {
  for (let y = top; y < top + fh; y++) {
    if (y < 0 || y >= height) continue
    for (let x = left; x < left + fw; x++) {
      if (x < 0 || x >= width) continue
      const at = (y * width + x) * 4
      canvas[at] = 0
      canvas[at + 1] = 0
      canvas[at + 2] = 0
      canvas[at + 3] = 0
    }
  }
}

/** Past a sub-block chain, given the position of its first length byte. */
function skipSubBlocks(bytes: Uint8Array, at: number): number {
  let position = at
  while (position < bytes.length) {
    const size = bytes[position]
    position += 1
    if (size === 0) return position
    position += size
  }
  return position
}

/** A sub-block chain, joined into the one buffer the LZW decoder wants. */
function readSubBlocks(bytes: Uint8Array, at: number): { data: Uint8Array; next: number } {
  // Measured first, then copied. Growing an array a sub-block at a time
  // reallocates 255 bytes at a time through a multi-megabyte frame.
  let position = at
  let total = 0
  while (position < bytes.length) {
    const size = bytes[position]
    position += 1
    if (size === 0) break
    total += size
    position += size
  }
  const next = position

  const data = new Uint8Array(total)
  position = at
  let written = 0
  while (position < bytes.length) {
    const size = bytes[position]
    position += 1
    if (size === 0) break
    data.set(bytes.subarray(position, position + size), written)
    written += size
    position += size
  }
  return { data, next }
}

/**
 * GIF's variable-width LZW, unpacked.
 *
 * The mirror of `lzwEncode` in `encode.ts`, and the same three details decide
 * whether it works: codes are packed least-significant-bit first; the width
 * grows when the next code to be *handed out* would not fit; and a clear code
 * resets the table mid-stream. Get any of them wrong and the picture decodes
 * correctly for a few thousand pixels and then turns to confetti.
 *
 * The dictionary is a pair of flat typed arrays rather than an array of arrays:
 * `prefix[code]` is the code this one extends and `suffix[code]` the byte it
 * adds, so a string is walked backwards into `stack` and read off in reverse.
 * 4096 JavaScript arrays per frame is the version of this that allocates more
 * than it decodes.
 */
function lzwDecode(data: Uint8Array, minCodeSize: number, pixels: number): Uint8Array {
  if (minCodeSize < 1 || minCodeSize > 11) throw new Error('This GIF frame declares an impossible code size')

  const clearCode = 1 << minCodeSize
  const endCode = clearCode + 1

  const prefix = new Uint16Array(4096)
  const suffix = new Uint8Array(4096)
  const stack = new Uint8Array(4096)

  const out = new Uint8Array(pixels)
  let written = 0

  let codeSize = minCodeSize + 1
  let next = endCode + 1
  let previous = -1

  let bits = 0
  let bitCount = 0
  let at = 0

  for (let code = 0; code < clearCode; code++) suffix[code] = code

  while (written < pixels) {
    // Refill. `bits` is a plain number, so it holds well over the 12 bits a
    // GIF code can reach without ever touching the sign bit.
    while (bitCount < codeSize) {
      if (at >= data.length) {
        // Truncated stream. A short file is common enough — a download that
        // stopped, a GIF cut by a chat client — and the frames already read are
        // worth more than an exception, so what decoded stands.
        return out
      }
      bits |= data[at++] << bitCount
      bitCount += 8
    }
    const code = bits & ((1 << codeSize) - 1)
    bits >>>= codeSize
    bitCount -= codeSize

    if (code === endCode) break

    if (code === clearCode) {
      codeSize = minCodeSize + 1
      next = endCode + 1
      previous = -1
      continue
    }

    if (previous === -1) {
      // The first code after a clear is always a literal, and it seeds the run.
      if (code >= clearCode) throw new Error('This GIF frame starts with a code that is not a colour')
      out[written++] = suffix[code]
      previous = code
      continue
    }

    // The one case that looks like corruption and is not: a code referring to
    // the entry that is about to be created, which happens whenever the encoder
    // met a run like `ababa`. Its expansion is the previous string plus that
    // string's own first byte.
    let top = 0
    let current = code
    if (code >= next) {
      current = previous
      stack[top++] = firstByte(prefix, suffix, clearCode, code === next ? previous : code)
    }

    while (current >= clearCode) {
      if (top >= stack.length) throw new Error('This GIF frame has a self-referential code')
      stack[top++] = suffix[current]
      current = prefix[current]
    }
    stack[top++] = suffix[current]

    while (top > 0 && written < pixels) out[written++] = stack[--top]

    if (next < 4096) {
      prefix[next] = previous
      suffix[next] = current // `current` has walked down to the string's first byte
      next++
      // Before the entry is used, not after it is added — see the note above.
      if (next >= 1 << codeSize && codeSize < 12) codeSize++
    }
    previous = code
  }

  return out
}

/** The first byte of the string a code expands to. */
function firstByte(prefix: Uint16Array, suffix: Uint8Array, clearCode: number, code: number): number {
  let current = code
  let guard = 0
  while (current >= clearCode) {
    current = prefix[current]
    if (++guard > 4096) throw new Error('This GIF frame has a self-referential code')
  }
  return suffix[current]
}

function latin1(bytes: Uint8Array, at: number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[at + i])
  return out
}
