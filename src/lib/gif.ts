/**
 * GIF89a — the palette builder, the quantiser and the LZW coder.
 *
 * A leaf module with no imports, like resize.ts, so scripts/selftest.mjs can
 * drive it in Node with no DOM and check the bytes against a real third-party
 * reader. The browser-side half — decoding a video into frames to feed it —
 * lives in videogif.ts.
 *
 * Why write one at all, when the browser encodes PNG, JPEG, WebP and AVIF for
 * us? Because `canvas.toBlob('image/gif')` does not exist in any engine, and
 * none of them expose an animation encoder of any kind. GIF is the single
 * format on this app's list the platform will not write, so this file is the
 * price of offering it — and it is a small price: the format is from 1989 and
 * the whole of it fits below.
 */

/**
 * Both halves of the colour problem — choosing 255 colours, and then finding
 * the nearest one for a pixel — work on a 32 768-bin grid of the top 5 bits of
 * each channel rather than on full 24-bit colour.
 *
 * That is not a shortcut taken for speed alone, it is what makes the job
 * finish: a nearest-colour search is 255 comparisons per pixel, and a 480×270
 * clip at 15 fps for ten seconds is 19 million pixels. Answering once per BIN
 * instead of once per pixel turns 5 billion comparisons into at most 8 million,
 * paid once. The cost is that the first colour to land in a bin decides for
 * every colour in that bin — a difference of at most 4 units per channel, which
 * is below the threshold of a GIF's 255-colour palette anyway.
 */
const BINS = 32768

function binOf(r: number, g: number, b: number): number {
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
}

/**
 * The palette index that means "leave whatever was already here".
 *
 * Fixed at the top of the table rather than allocated, so it cannot collide
 * with a real colour: the quantiser is capped at 255 colours (0…254) and this
 * is 255. Frame differencing writes it over every pixel that did not change
 * from the frame before, which is the single biggest thing keeping these files
 * from being absurd — a talking head against a still background changes maybe a
 * fifth of its pixels per frame, and the other four fifths cost nothing.
 */
export const TRANSPARENT_INDEX = 255

/** The most real colours a palette can hold — 255, with the last index reserved above. */
export const MAX_COLOURS = 255

// ── Choosing the colours ─────────────────────────────────────────────────────

/**
 * A histogram of every colour in the clip, and the median cut that reduces it
 * to a palette.
 *
 * One palette for the WHOLE animation, not one per frame. A local colour table
 * per frame would cost 768 bytes each and, far worse, would make the palette
 * itself shimmer between frames — the same wall changing shade every time the
 * quantiser re-decides. A global table also costs nothing extra to diff
 * against, which is what frame differencing needs.
 */
export class ColourCube {
  private counts = new Uint32Array(BINS)
  /** Running r/g/b totals per bin, so a bin's colour is its true average rather than its corner. */
  private sums = new Float64Array(BINS * 3)

  /** Add every pixel of one RGBA frame. Alpha is ignored — video frames are opaque. */
  addFrame(rgba: Uint8ClampedArray | Uint8Array): void {
    for (let p = 0; p + 3 < rgba.length; p += 4) {
      const r = rgba[p]
      const g = rgba[p + 1]
      const b = rgba[p + 2]
      const bin = binOf(r, g, b)
      this.counts[bin]++
      const s = bin * 3
      this.sums[s] += r
      this.sums[s + 1] += g
      this.sums[s + 2] += b
    }
  }

  /**
   * Median cut: start with one box holding every colour in the clip, and keep
   * splitting the most deserving box in half along its widest channel until
   * there are `maxColours` of them. Each box then contributes its average
   * colour.
   *
   * Splitting at the *weighted* median rather than the midpoint is what makes
   * it median cut rather than a uniform grid: a frame that is 90% skin tone
   * gets most of the palette spent on skin tones, because that is where the
   * pixels are.
   */
  palette(maxColours = MAX_COLOURS): Uint8Array {
    const limit = Math.max(1, Math.min(MAX_COLOURS, maxColours))

    // The occupied bins, and each one's average colour.
    const order: number[] = []
    for (let bin = 0; bin < BINS; bin++) if (this.counts[bin] > 0) order.push(bin)
    // A clip with no pixels at all still has to produce a legal colour table.
    if (order.length === 0) return new Uint8Array([0, 0, 0])

    const avg = new Float64Array(BINS * 3)
    for (const bin of order) {
      const n = this.counts[bin]
      avg[bin * 3] = this.sums[bin * 3] / n
      avg[bin * 3 + 1] = this.sums[bin * 3 + 1] / n
      avg[bin * 3 + 2] = this.sums[bin * 3 + 2] / n
    }

    const boxes: Box[] = [this.measure(order, 0, order.length, avg)]

    while (boxes.length < limit) {
      // The box with the most pixels across the widest spread of colour. Using
      // the count alone would keep re-splitting a large flat area into
      // near-identical shades; multiplying by the spread spends the next
      // palette entry where it will actually be visible.
      let pick = -1
      let best = 0
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i]
        if (box.hi - box.lo < 2) continue // one bin — nothing left to split
        if (box.priority > best) {
          best = box.priority
          pick = i
        }
      }
      if (pick < 0) break // every box is a single colour; the clip has fewer than `limit`

      const box = boxes[pick]
      const channel = box.channel
      const slice = order.slice(box.lo, box.hi)
      slice.sort((a, b) => avg[a * 3 + channel] - avg[b * 3 + channel])
      for (let i = 0; i < slice.length; i++) order[box.lo + i] = slice[i]

      // Cut where half the box's PIXELS lie, not half its bins — and never at
      // an end, or the split would produce an empty box and the loop would
      // spin re-picking the same one.
      const half = box.count / 2
      let seen = 0
      let cut = box.lo + 1
      for (let i = box.lo; i < box.hi - 1; i++) {
        seen += this.counts[order[i]]
        cut = i + 1
        if (seen >= half) break
      }

      boxes[pick] = this.measure(order, box.lo, cut, avg)
      boxes.push(this.measure(order, cut, box.hi, avg))
    }

    const colours = new Uint8Array(boxes.length * 3)
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let j = box.lo; j < box.hi; j++) {
        const bin = order[j]
        r += this.sums[bin * 3]
        g += this.sums[bin * 3 + 1]
        b += this.sums[bin * 3 + 2]
        n += this.counts[bin]
      }
      colours[i * 3] = clamp255(Math.round(r / n))
      colours[i * 3 + 1] = clamp255(Math.round(g / n))
      colours[i * 3 + 2] = clamp255(Math.round(b / n))
    }
    return colours
  }

  /** A box's pixel count, its widest channel and how wide that is. */
  private measure(order: number[], lo: number, hi: number, avg: Float64Array): Box {
    let count = 0
    const min = [255, 255, 255]
    const max = [0, 0, 0]
    for (let i = lo; i < hi; i++) {
      const bin = order[i]
      count += this.counts[bin]
      for (let c = 0; c < 3; c++) {
        const value = avg[bin * 3 + c]
        if (value < min[c]) min[c] = value
        if (value > max[c]) max[c] = value
      }
    }
    let channel = 0
    let spread = 0
    for (let c = 0; c < 3; c++) {
      const range = max[c] - min[c]
      if (range > spread) {
        spread = range
        channel = c
      }
    }
    return { lo, hi, count, channel, priority: count * (spread + 1) }
  }
}

interface Box {
  /** Half-open range into the shared bin ordering. */
  lo: number
  hi: number
  /** Pixels, not bins. */
  count: number
  /** 0 = red, 1 = green, 2 = blue — the channel this box is widest in. */
  channel: number
  priority: number
}

// ── Using the colours ────────────────────────────────────────────────────────

/** A palette, plus the per-bin cache that makes looking colours up in it affordable. */
export class PaletteMap {
  readonly colours: Uint8Array
  readonly count: number
  private cache = new Int16Array(BINS).fill(-1)

  constructor(colours: Uint8Array) {
    this.colours = colours
    this.count = Math.floor(colours.length / 3)
    if (this.count < 1) throw new Error('A GIF palette needs at least one colour')
    if (this.count > MAX_COLOURS) {
      throw new Error(`A GIF palette here holds at most ${MAX_COLOURS} colours — index ${TRANSPARENT_INDEX} is reserved`)
    }
  }

  /**
   * The nearest palette entry, by straight Euclidean distance in sRGB.
   *
   * Not a perceptual metric on purpose: a weighted one would be marginally
   * kinder to skin tones and a great deal harder to state, and the tests would
   * then be asserting against a formula rather than against "the nearest
   * colour". Cached per 5-5-5 bin — see the note at the top of the file.
   */
  indexOf(r: number, g: number, b: number): number {
    const bin = binOf(r, g, b)
    const hit = this.cache[bin]
    if (hit >= 0) return hit

    let best = 0
    let bestDistance = Infinity
    for (let i = 0; i < this.count; i++) {
      const dr = r - this.colours[i * 3]
      const dg = g - this.colours[i * 3 + 1]
      const db = b - this.colours[i * 3 + 2]
      const distance = dr * dr + dg * dg + db * db
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
        if (distance === 0) break
      }
    }
    this.cache[bin] = best
    return best
  }
}

/**
 * One RGBA frame → one palette index per pixel.
 *
 * `dither` spreads each pixel's rounding error into its neighbours
 * (Floyd–Steinberg), which is the difference between a sky that fades and a sky
 * in five visible bands. ⚠️ It is off by default in the app, and the reason is
 * not taste: dithering replaces flat areas with fine noise, and fine noise
 * differs from frame to frame even where nothing moved — so it defeats the
 * frame differencing below and can double or triple the file. Gradients get it
 * turned on deliberately.
 */
export function quantiseFrame(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  map: PaletteMap,
  dither = false,
): Uint8Array {
  const out = new Uint8Array(width * height)

  if (!dither) {
    for (let i = 0, p = 0; i < out.length; i++, p += 4) {
      out[i] = map.indexOf(rgba[p], rgba[p + 1], rgba[p + 2])
    }
    return out
  }

  // Two rows of carried error: the one being drawn and the one below it.
  let here = new Float32Array(width * 3)
  let below = new Float32Array(width * 3)

  for (let y = 0; y < height; y++) {
    below.fill(0)
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4
      const e = x * 3
      const r = clamp255(rgba[p] + here[e])
      const g = clamp255(rgba[p + 1] + here[e + 1])
      const b = clamp255(rgba[p + 2] + here[e + 2])

      const index = map.indexOf(Math.round(r), Math.round(g), Math.round(b))
      out[y * width + x] = index

      const er = r - map.colours[index * 3]
      const eg = g - map.colours[index * 3 + 1]
      const eb = b - map.colours[index * 3 + 2]

      if (x + 1 < width) spread(here, (x + 1) * 3, er, eg, eb, 7 / 16)
      if (x > 0) spread(below, (x - 1) * 3, er, eg, eb, 3 / 16)
      spread(below, x * 3, er, eg, eb, 5 / 16)
      if (x + 1 < width) spread(below, (x + 1) * 3, er, eg, eb, 1 / 16)
    }
    const swap = here
    here = below
    below = swap
  }
  return out
}

function spread(row: Float32Array, at: number, r: number, g: number, b: number, share: number): void {
  row[at] += r * share
  row[at + 1] += g * share
  row[at + 2] += b * share
}

function clamp255(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value
}

// ── Writing the file ─────────────────────────────────────────────────────────

/**
 * A GIF89a animation, written frame by frame.
 *
 * Streaming rather than "hand me every frame and I'll build it": a ten-second
 * 480×270 clip is 150 frames, and holding them all as RGBA would be 78 MB of
 * live pixels before a byte of output existed. Here the only frames in memory
 * at once are the one being written and the one before it, one byte per pixel
 * each, and the finished chunks go straight into a Blob.
 *
 * The differencing, the bounding box and the transparency are all done in here
 * rather than by the caller, because getting them subtly wrong produces a file
 * that plays correctly in the browser that wrote it and smears in everything
 * else — the classic GIF failure, and not one a caller should be able to reach.
 */
export class GifWriter {
  private readonly chunks: Uint8Array[] = []
  private previous: Uint8Array | null = null
  readonly width: number
  readonly height: number

  // ⚠️ `width` and `height` are assigned in the body rather than declared as
  // constructor parameter properties. Node's type stripping — which is how
  // scripts/selftest.mjs runs this file with no build step — refuses parameter
  // properties outright, because they are the one TypeScript feature that
  // EMITS code rather than annotating it. The self-test is the point of this
  // module being a leaf, so the shorthand loses.
  constructor(width: number, height: number, colours: Uint8Array, loop = true) {
    this.width = width
    this.height = height
    if (width < 1 || height < 1) throw new Error('A GIF needs a frame size')
    if (width > 65535 || height > 65535) throw new Error('A GIF frame cannot be larger than 65535 px')
    const count = Math.floor(colours.length / 3)
    if (count < 1 || count > MAX_COLOURS) {
      throw new Error(`A GIF palette here holds 1–${MAX_COLOURS} colours, not ${count}`)
    }

    const head: number[] = []
    push(head, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) // "GIF89a"
    word(head, width)
    word(head, height)
    // Global colour table present, 8 bits of colour resolution, 256 entries.
    head.push(0xf7, 0, 0)

    // The table is always the full 256 entries — its size is a power of two by
    // the spec, and padding it is what lets index 255 mean "transparent"
    // whatever the quantiser actually found.
    const table = new Uint8Array(768)
    table.set(colours.subarray(0, count * 3))
    this.chunks.push(Uint8Array.from(head), table)

    if (loop) {
      // NETSCAPE2.0, loop count 0 = forever. Leaving this out is what makes a
      // GIF play once, so it is a genuine choice rather than boilerplate.
      const ext: number[] = [0x21, 0xff, 0x0b]
      push(ext, [...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)))
      ext.push(0x03, 0x01, 0x00, 0x00, 0x00)
      this.chunks.push(Uint8Array.from(ext))
    }
  }

  /**
   * One frame, as `width × height` palette indices, held on screen for
   * `delayCs` hundredths of a second.
   *
   * ⚠️ `delayCs` is floored at 2. A GIF's delay field is in hundredths, and
   * every browser silently rewrites a delay of 0 or 1 to 10 — so a "100 fps"
   * animation does not play fast, it plays at a tenth speed. Two is the
   * smallest value that means what it says.
   */
  addFrame(indices: Uint8Array, delayCs: number): void {
    if (indices.length !== this.width * this.height) {
      throw new Error(`This frame is ${indices.length} pixels, not ${this.width * this.height}`)
    }
    const delay = Math.max(2, Math.min(65535, Math.round(delayCs)))

    if (!this.previous) {
      this.writeFrame(0, 0, this.width, this.height, indices, false, delay)
      this.previous = indices.slice()
      return
    }

    // The rectangle that actually changed. Everything outside it is already on
    // screen and is simply not sent again.
    let minX = this.width
    let minY = this.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < this.height; y++) {
      const row = y * this.width
      for (let x = 0; x < this.width; x++) {
        if (indices[row + x] !== this.previous[row + x]) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    if (maxX < 0) {
      // A frame identical to the one before it — a held shot, or a source with
      // duplicated frames. One transparent pixel carries the delay and changes
      // nothing on screen, which is both correct and about twenty bytes.
      this.writeFrame(0, 0, 1, 1, ONE_TRANSPARENT_PIXEL, true, delay)
      return
    }

    const w = maxX - minX + 1
    const h = maxY - minY + 1
    const sub = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      const from = (minY + y) * this.width + minX
      const to = y * w
      for (let x = 0; x < w; x++) {
        // Unchanged pixels inside the rectangle go transparent too: with
        // disposal "do not dispose" the previous pixel shows through
        // unaltered, and a long run of one index is what LZW compresses best.
        sub[to + x] = indices[from + x] === this.previous[from + x] ? TRANSPARENT_INDEX : indices[from + x]
      }
    }
    this.writeFrame(minX, minY, w, h, sub, true, delay)
    this.previous.set(indices)
  }

  /** The finished file, as the chunks to hand a Blob. */
  finish(): Uint8Array[] {
    return [...this.chunks, Uint8Array.from([0x3b])]
  }

  private writeFrame(
    left: number,
    top: number,
    width: number,
    height: number,
    indices: Uint8Array,
    transparent: boolean,
    delayCs: number,
  ): void {
    const meta: number[] = []

    // Graphic control extension. Disposal method 1 — "do not dispose" — is what
    // makes differencing legal: it leaves the previous frame on screen for the
    // next one to draw over. Method 2 (restore to background) with the same
    // frame data would flash the background through every transparent pixel.
    meta.push(0x21, 0xf9, 0x04, transparent ? 0x05 : 0x04)
    word(meta, delayCs)
    meta.push(TRANSPARENT_INDEX, 0x00)

    // Image descriptor: position, size, and no local colour table.
    meta.push(0x2c)
    word(meta, left)
    word(meta, top)
    word(meta, width)
    word(meta, height)
    meta.push(0x00)
    // The table is 256 entries, so every code is 8 bits wide before LZW starts.
    meta.push(8)

    this.chunks.push(Uint8Array.from(meta), lzwEncode(indices, 8))
  }
}

const ONE_TRANSPARENT_PIXEL = Uint8Array.from([TRANSPARENT_INDEX])

function word(out: number[], value: number): void {
  out.push(value & 0xff, (value >> 8) & 0xff)
}

function push(out: number[], values: number[]): void {
  for (const value of values) out.push(value)
}

// ── LZW ──────────────────────────────────────────────────────────────────────

/**
 * GIF's variable-width LZW, packed into the sub-blocks the format wants.
 *
 * Three details are where every implementation of this goes wrong, so they are
 * spelled out rather than left to be rediscovered:
 *
 *  1. Codes are packed LEAST significant bit first, which is the opposite of
 *     nearly every other length-prefixed format.
 *  2. The code width grows when the NEXT code to be handed out would not fit —
 *     checked before the entry is added, not after. One off here and the file
 *     decodes to noise from the first thousandth code onwards, which looks like
 *     a working encoder that occasionally produces confetti.
 *  3. At 4096 entries the table is full: emit a clear code and start again. The
 *     clear code itself goes out at the OLD width, before the reset.
 */
export function lzwEncode(indices: Uint8Array, minCodeSize = 8): Uint8Array {
  const clearCode = 1 << minCodeSize
  const endCode = clearCode + 1

  const blocks = new SubBlocks()
  let bits = 0
  let bitCount = 0
  let codeSize = minCodeSize + 1
  let next = endCode + 1
  const table = new Map<number, number>()

  const emit = (code: number) => {
    bits |= code << bitCount
    bitCount += codeSize
    while (bitCount >= 8) {
      blocks.push(bits & 0xff)
      bits >>>= 8
      bitCount -= 8
    }
  }

  emit(clearCode)

  if (indices.length > 0) {
    let prefix = indices[0]
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i]
      const key = (prefix << 8) | k
      const found = table.get(key)
      if (found !== undefined) {
        prefix = found
        continue
      }
      emit(prefix)
      if (next === 4096) {
        emit(clearCode)
        table.clear()
        next = endCode + 1
        codeSize = minCodeSize + 1
      } else {
        if (next >= 1 << codeSize) codeSize++
        table.set(key, next++)
      }
      prefix = k
    }
    emit(prefix)
  }

  emit(endCode)
  if (bitCount > 0) blocks.push(bits & 0xff)
  return blocks.finish()
}

/**
 * GIF carries image data in blocks of at most 255 bytes, each with its length
 * in front, ending with a zero-length block. Growable so a noisy frame that
 * barely compresses doesn't need its size guessed up front.
 */
class SubBlocks {
  private out = new Uint8Array(8192)
  private length = 0
  private block = new Uint8Array(255)
  private held = 0

  push(byte: number): void {
    this.block[this.held++] = byte
    if (this.held === 255) this.flush()
  }

  finish(): Uint8Array {
    if (this.held > 0) this.flush()
    this.reserve(1)
    this.out[this.length++] = 0
    return this.out.subarray(0, this.length)
  }

  private flush(): void {
    this.reserve(this.held + 1)
    this.out[this.length++] = this.held
    this.out.set(this.block.subarray(0, this.held), this.length)
    this.length += this.held
    this.held = 0
  }

  private reserve(extra: number): void {
    if (this.length + extra <= this.out.length) return
    let size = this.out.length * 2
    while (size < this.length + extra) size *= 2
    const bigger = new Uint8Array(size)
    bigger.set(this.out.subarray(0, this.length))
    this.out = bigger
  }
}
