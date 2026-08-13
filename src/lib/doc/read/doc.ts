// ---------------------------------------------------------------------------
// DOC (Word 97–2003) → RichDoc, as TEXT ONLY. That limit is the whole story.
//
// A .doc is not an older .docx. It is a Microsoft Compound File — a FAT
// filesystem in a file, with directories and a sector allocation table — and
// inside it the `WordDocument` stream is a C struct dump from 1997. The text is
// not in one place and not in one encoding: a PIECE TABLE maps ranges of the
// document onto byte ranges of the stream, each piece independently either
// CP1252 or UTF-16, and the pieces are in storage order rather than reading
// order. Recovering the words means walking that table. Recovering the
// FORMATTING means also walking the CHPX/PAPX binary property exception runs
// through a two-level page tree of 512-byte bins — a second machine of similar
// size, for bold and headings.
//
// So: this reads the words, in the right order, in the right encoding, and
// stops. Paragraph breaks are kept; bold, headings, tables, lists and pictures
// are not, and the UI says so BEFORE the button is pressed rather than leaving
// somebody to notice their headings vanished on page three.
//
// The honest alternative is telling people to open it in Word and save as
// .docx, which the notice does — but a .doc you are handed and cannot open
// still converts to something readable here, and that is worth having.
// ---------------------------------------------------------------------------

import { addNotice, tidy, type Block, type RichDoc } from '../model'

/** The compound-file signature: D0 CF 11 E0 A1 B1 1A E1. */
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

/**
 * One thing the paragraph splitter found.
 *
 * ⚠️ A TYPE, NOT A SENTINEL STRING. The shortcut this replaced was a marker
 * string pushed into the text and matched afterwards. It had control
 * characters wrapped round it to make a collision unlikely, which is the tell:
 * the text being split is somebody else’s document, so unlikely is the best a
 * sentinel can ever be, and the guards were invisible in the source. A
 * discriminated union cannot be spoofed by content at all.
 */
type Piece = { kind: 'text'; text: string } | { kind: 'break' }

export async function readDoc(file: File): Promise<RichDoc> {
  const bytes = new Uint8Array(await file.arrayBuffer())

  if (!OLE_SIGNATURE.every((b, i) => bytes[i] === b)) {
    // RTF and DOCX both get saved with a .doc extension often enough to be
    // worth naming rather than failing as "damaged".
    if (bytes[0] === 0x7b && bytes[1] === 0x5c) {
      throw new Error('This is really an RTF file with a .doc name — rename it to .rtf and it will convert.')
    }
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      throw new Error('This is really a .docx with a .doc name — rename it to .docx and it will convert in full.')
    }
    throw new Error('This doesn’t look like a Word document inside.')
  }

  const cfb = new CompoundFile(bytes)
  const stream = cfb.read('WordDocument')
  if (!stream) throw new Error('This compound file has no Word document in it.')

  const doc: RichDoc = { blocks: [], notices: [] }
  const text = extractText(stream, cfb)

  for (const piece of splitParagraphs(text)) {
    doc.blocks.push(
      piece.kind === 'break'
        ? { kind: 'pagebreak' }
        : ({ kind: 'paragraph', runs: [{ text: piece.text }] } satisfies Block),
    )
  }

  if (!doc.blocks.length) throw new Error('No readable text was found in this .doc.')

  addNotice(
    doc,
    'This is the old Word format, so only its TEXT could be read — bold, headings, lists, tables, page breaks and pictures are not in the result. Opening it in Word and saving as .docx keeps all of that.',
  )
  // ⚠️ Said separately, and said even though it will not apply to most files,
  // because it is the one loss here that can EMBARRASS somebody rather than
  // merely disappoint them. A .doc's deleted text is stored as ordinary text in
  // the piece table with a revision flag hung off it in the CHPX runs, and this
  // reader does not walk those — so a document with tracked changes turned on
  // converts with the deletions still in it, reading as though they were never
  // made. Detecting it properly needs the whole property-exception machine that
  // the header explains is out of scope, so it is disclosed instead of guessed
  // at. It sits beside the file on the row, before anyone sends it on.
  addNotice(
    doc,
    'If this document had tracked changes in it, text that was deleted may still appear — the old format stores deletions as ordinary text, and only Word can tell them apart. Check the result before sending it on.',
  )
  doc.title = file.name.replace(/\.docx?$/i, '')
  return tidy(doc)
}

// ── The piece table ──────────────────────────────────────────────────────────

/**
 * Walk the FIB and the piece table to reassemble the document text.
 *
 * The route, which is not guessable from the bytes:
 *   1. The FIB at offset 0 says which stream the text lives in (`fWhichTblStm`
 *      picks `1Table` or `0Table`) and where the CLX is inside it.
 *   2. The CLX is a list of properties followed by ONE `Pcdt` (type 0x02),
 *      which holds the piece table.
 *   3. The piece table is a PLCF: n+1 character positions, then n 8-byte
 *      descriptors. Descriptor bytes 2–5 are an `fc` whose BIT 30 means
 *      "this piece is CP1252, and the real offset is fc/2".
 */
function extractText(wordStream: Uint8Array, cfb: CompoundFile): string {
  const view = new DataView(wordStream.buffer, wordStream.byteOffset, wordStream.byteLength)

  const flags = view.getUint16(0x000a, true)
  const useTable1 = (flags & 0x0200) !== 0
  const table = cfb.read(useTable1 ? '1Table' : '0Table') ?? cfb.read('0Table') ?? cfb.read('1Table')
  if (!table) {
    // Word 6/95 had no table stream at all and stored text unpiece-tabled.
    return decodeCp1252(wordStream.subarray(view.getUint32(0x0018, true), view.getUint32(0x001c, true)))
  }

  const clxOffset = view.getUint32(0x01a2, true)
  const clxLength = view.getUint32(0x01a6, true)
  if (clxOffset + clxLength > table.length || clxLength < 5) {
    throw new Error('This .doc’s index is damaged — the text can’t be located.')
  }
  const clx = table.subarray(clxOffset, clxOffset + clxLength)

  // Skip the leading Prc blocks (type 0x01, each with a 2-byte length) to find
  // the one Pcdt (type 0x02) that follows them.
  let at = 0
  while (at < clx.length && clx[at] === 0x01) {
    const size = new DataView(clx.buffer, clx.byteOffset + at + 1, 2).getUint16(0, true)
    at += 3 + size
  }
  if (clx[at] !== 0x02) throw new Error('This .doc’s piece table is missing.')

  const clxView = new DataView(clx.buffer, clx.byteOffset, clx.byteLength)
  const pieceTableSize = clxView.getUint32(at + 1, true)
  const pieces = clx.subarray(at + 5, at + 5 + pieceTableSize)
  const pieceView = new DataView(pieces.buffer, pieces.byteOffset, pieces.byteLength)

  // n pieces means n+1 positions (4 bytes each) and n descriptors (8 each).
  const count = Math.floor((pieces.length - 4) / 12)
  if (count <= 0) throw new Error('This .doc’s piece table is empty.')

  let out = ''
  for (let i = 0; i < count; i += 1) {
    const start = pieceView.getUint32(i * 4, true)
    const end = pieceView.getUint32((i + 1) * 4, true)
    const descriptor = 4 * (count + 1) + i * 8
    const fc = pieceView.getUint32(descriptor + 2, true)

    // Bit 30 is the compression flag, and it is the crux of the whole format.
    const compressed = (fc & 0x40000000) !== 0
    const offset = compressed ? (fc & 0x3fffffff) / 2 : fc & 0x3fffffff
    const characters = end - start
    if (characters <= 0) continue

    const byteLength = compressed ? characters : characters * 2
    const slice = wordStream.subarray(offset, offset + byteLength)
    out += compressed ? decodeCp1252(slice) : decodeUtf16(slice)
  }

  return out
}

/**
 * Windows-1252, which is what "compressed" means here — one byte per character,
 * NOT ASCII. `TextDecoder('windows-1252')` is in every browser and gets the
 * 0x80–0x9F block (smart quotes, dashes) right, which is exactly the range a
 * Word document is full of and the range a naive `String.fromCharCode` mangles.
 */
function decodeCp1252(bytes: Uint8Array): string {
  return new TextDecoder('windows-1252').decode(bytes)
}

function decodeUtf16(bytes: Uint8Array): string {
  return new TextDecoder('utf-16le').decode(bytes)
}

/**
 * Word's control characters, turned back into paragraphs.
 *
 * \r is the paragraph mark — NOT \n, which does not appear. \x07 ends a table
 * cell and a table row; \x0c is a page break; \x0b a line break within a
 * paragraph; \x13–\x15 wrap field instructions, whose contents are code
 * (`HYPERLINK "…"`, `PAGE \\* MERGEFORMAT`) rather than text and would
 * otherwise appear inline as gibberish.
 */
function splitParagraphs(text: string): Piece[] {
  const pieces: Piece[] = []
  let cleaned = ''
  let inFieldInstruction = false

  /** Turn whatever text has accumulated into paragraph pieces. */
  const flush = () => {
    const paragraphs = cleaned
      .split('\r')
      // A literal NUL pads the tail of the last piece in a great many files.
      // Left in, it draws as a hollow box in the PDF rather than as nothing.
      .map((p) => p.replace(/\t/g, '  ').replace(/\0/g, '').trim())
      .filter((p, i, all) => p.length > 0 || (i > 0 && all[i - 1].length > 0))
    for (const text of paragraphs) pieces.push({ kind: 'text', text })
    cleaned = ''
  }

  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code === 0x13) { inFieldInstruction = true; continue }  // field begin
    if (code === 0x14) { inFieldInstruction = false; continue } // separator: result follows
    if (code === 0x15) { inFieldInstruction = false; continue } // field end
    if (inFieldInstruction) continue

    if (code === 0x07) { cleaned += '\r'; continue }  // cell/row end
    if (code === 0x0b) { cleaned += '\n'; continue }  // line break
    // An explicit page-break character — what Word writes for Ctrl+Enter. It
    // becomes a real break rather than a paragraph mark, because a .doc whose
    // author broke each section by hand otherwise arrives as one unbroken run.
    //
    // ⚠️ THIS CATCHES ONLY ONE OF THE TWO WAYS A .doc HOLDS A PAGE BREAK. The
    // other is a paragraph PROPERTY in the PAPX runs — which is what
    // LibreOffice writes, and what the file header explains this reader does
    // not walk. So some page breaks survive and some do not, and the notice on
    // the row lists page breaks among what the old format loses.
    if (code === 0x0c) { flush(); pieces.push({ kind: 'break' }); continue }
    if (code === 0x1e) { cleaned += '-'; continue }   // non-breaking hyphen
    if (code === 0x1f) continue                       // optional hyphen
    if (code === 0x02) continue                       // footnote mark
    if (code < 0x20 && code !== 0x09 && code !== 0x0d) continue
    cleaned += ch
  }

  flush()
  return pieces
}

// ── The compound file ────────────────────────────────────────────────────────

/**
 * Enough of the Microsoft Compound File format to pull two named streams out.
 *
 * It is a filesystem: a header, a FAT of sector chains, a directory of entries,
 * and — for anything under 4096 bytes — a second miniature allocation inside a
 * ministream, because the designers did not want a 64-byte stream costing a
 * 512-byte sector. Both paths are needed: `1Table` is routinely large and
 * `WordDocument` always is, but a small document puts one of them in the mini
 * FAT and reading it as a normal chain returns garbage.
 */
class CompoundFile {
  private bytes: Uint8Array
  private view: DataView
  private sectorSize: number
  private miniSectorSize: number
  private fat: number[] = []
  private miniFat: number[] = []
  private directory: DirEntry[] = []
  private miniStream: Uint8Array = new Uint8Array(0)

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    this.sectorSize = 1 << this.view.getUint16(0x1e, true)
    this.miniSectorSize = 1 << this.view.getUint16(0x20, true)
    this.readFat()
    this.readDirectory()
  }

  read(name: string): Uint8Array | null {
    const entry = this.directory.find((e) => e.name === name)
    if (!entry || entry.size === 0) return null
    return entry.size < 4096 && this.miniStream.length
      ? this.readChain(entry.start, entry.size, this.miniFat, this.miniSectorSize, this.miniStream)
      : this.readChain(entry.start, entry.size, this.fat, this.sectorSize, null)
  }

  private sectorAt(index: number): number {
    return (index + 1) * this.sectorSize
  }

  private readFat(): void {
    const difatCount = this.view.getUint32(0x48, true)
    const sectors: number[] = []

    // The first 109 FAT sector numbers are in the header itself; anything
    // beyond that continues in DIFAT sectors, which only very large files need.
    for (let i = 0; i < 109; i += 1) {
      const sector = this.view.getUint32(0x4c + i * 4, true)
      if (sector === 0xffffffff) break
      sectors.push(sector)
    }

    let difat = this.view.getUint32(0x44, true)
    for (let n = 0; n < difatCount && difat !== 0xffffffff && difat !== 0xfffffffe; n += 1) {
      const base = this.sectorAt(difat)
      const perSector = this.sectorSize / 4 - 1
      for (let i = 0; i < perSector; i += 1) {
        const sector = this.view.getUint32(base + i * 4, true)
        if (sector === 0xffffffff) break
        sectors.push(sector)
      }
      difat = this.view.getUint32(base + perSector * 4, true)
    }

    for (const sector of sectors) {
      const base = this.sectorAt(sector)
      if (base + this.sectorSize > this.bytes.length) break
      for (let i = 0; i < this.sectorSize / 4; i += 1) {
        this.fat.push(this.view.getUint32(base + i * 4, true))
      }
    }

    let miniFatSector = this.view.getUint32(0x3c, true)
    const miniFatCount = this.view.getUint32(0x40, true)
    for (let n = 0; n < miniFatCount && miniFatSector < 0xfffffffa; n += 1) {
      const base = this.sectorAt(miniFatSector)
      if (base + this.sectorSize > this.bytes.length) break
      for (let i = 0; i < this.sectorSize / 4; i += 1) {
        this.miniFat.push(this.view.getUint32(base + i * 4, true))
      }
      miniFatSector = this.fat[miniFatSector] ?? 0xfffffffe
    }
  }

  private readDirectory(): void {
    const first = this.view.getUint32(0x30, true)
    const raw = this.readChain(first, Number.MAX_SAFE_INTEGER, this.fat, this.sectorSize, null)
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)

    for (let at = 0; at + 128 <= raw.length; at += 128) {
      const nameLength = view.getUint16(at + 64, true)
      if (nameLength < 2 || nameLength > 64) continue
      // The name is UTF-16 and the length INCLUDES its terminator, which is why
      // this is `nameLength - 2` and not `nameLength`.
      const name = new TextDecoder('utf-16le').decode(raw.subarray(at, at + nameLength - 2))
      const type = raw[at + 66]
      const start = view.getUint32(at + 116, true)
      const size = view.getUint32(at + 120, true)
      this.directory.push({ name, type, start, size })
    }

    // Entry 0 is the root, and its "stream" is the ministream that every small
    // stream is carved out of.
    const root = this.directory[0]
    if (root && root.size > 0) {
      this.miniStream = this.readChain(root.start, root.size, this.fat, this.sectorSize, null)
    }
  }

  /**
   * Follow a sector chain.
   *
   * The guard on `seen` is not paranoia about hostile files: a truncated
   * download produces a FAT whose chain loops back on itself, and without it
   * this allocates until the tab dies.
   */
  private readChain(
    start: number,
    size: number,
    fat: number[],
    sectorSize: number,
    container: Uint8Array | null,
  ): Uint8Array {
    const parts: Uint8Array[] = []
    const seen = new Set<number>()
    let sector = start
    let remaining = size

    while (sector < 0xfffffffa && remaining > 0) {
      if (seen.has(sector)) break
      seen.add(sector)
      const base = container ? sector * sectorSize : this.sectorAt(sector)
      const source = container ?? this.bytes
      if (base >= source.length) break
      const take = Math.min(sectorSize, remaining, source.length - base)
      parts.push(source.subarray(base, base + take))
      remaining -= take
      sector = fat[sector] ?? 0xfffffffe
    }

    const total = parts.reduce((n, p) => n + p.length, 0)
    const out = new Uint8Array(total)
    let at = 0
    for (const part of parts) {
      out.set(part, at)
      at += part.length
    }
    return out
  }
}

interface DirEntry {
  name: string
  type: number
  start: number
  size: number
}
