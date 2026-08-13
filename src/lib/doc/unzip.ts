// ---------------------------------------------------------------------------
// A ZIP reader, in one page and with no dependency.
//
// A .docx and a .odt are both ZIPs of XML, so reading either starts here. The
// app already WRITES ZIPs (`zip.ts`) for "Download all"; this is the other
// direction, and it needs one thing that writing did not: DEFLATE.
//
// `DecompressionStream('deflate-raw')` is that, built into the browser — the
// same primitive PalsPayIn leans on for its relay payloads. It is why this file
// is a hundred lines instead of a fflate dependency: the compression is the
// hard part and the platform already has it, leaving only the container, which
// is a central directory of fixed-width records.
//
// WHY THE CENTRAL DIRECTORY AND NOT THE LOCAL HEADERS
// ---------------------------------------------------
// Walking local headers front-to-back looks simpler and is a trap: an entry
// written by a streaming producer sets its sizes to zero and puts the real ones
// in a data descriptor AFTER the data, so you cannot know where the entry ends
// without decompressing it first. The central directory at the tail always has
// the true sizes. Word and LibreOffice both produce files that need this.
// ---------------------------------------------------------------------------

const END_OF_CENTRAL = 0x06054b50
const CENTRAL_HEADER = 0x02014b50
const ZIP64_END_LOCATOR = 0x07064b50

interface Entry {
  name: string
  /** 0 = stored, 8 = deflate. Anything else we refuse by name. */
  method: number
  offset: number
  compressedSize: number
}

export class ZipArchive {
  private bytes: Uint8Array
  private view: DataView
  private entries = new Map<string, Entry>()

  private constructor(bytes: Uint8Array) {
    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  static async open(source: Blob | ArrayBuffer): Promise<ZipArchive> {
    const buffer = source instanceof Blob ? await source.arrayBuffer() : source
    const archive = new ZipArchive(new Uint8Array(buffer))
    archive.readDirectory()
    return archive
  }

  /** Every path in the archive, in directory order. */
  get names(): string[] {
    return [...this.entries.keys()]
  }

  has(name: string): boolean {
    return this.entries.has(name)
  }

  async bytesOf(name: string): Promise<Uint8Array | null> {
    const entry = this.entries.get(name)
    if (!entry) return null

    // The local header repeats the name and extra field, and its lengths are
    // the ones that count — a producer may write a different extra field here
    // than in the central directory, so the data offset must be computed from
    // this copy rather than from the directory's.
    const local = entry.offset
    if (this.view.getUint32(local, true) !== 0x04034b50) {
      throw new Error(`${name} is not where this archive says it is.`)
    }
    const nameLength = this.view.getUint16(local + 26, true)
    const extraLength = this.view.getUint16(local + 28, true)
    const start = local + 30 + nameLength + extraLength
    const raw = this.bytes.subarray(start, start + entry.compressedSize)

    if (entry.method === 0) return raw
    if (entry.method !== 8) {
      throw new Error(`This file uses a compression method (${entry.method}) browsers can’t undo.`)
    }
    return inflateRaw(raw)
  }

  async textOf(name: string): Promise<string | null> {
    const bytes = await this.bytesOf(name)
    // Every XML part in an Office or OpenDocument package is UTF-8; the
    // declaration says so and nothing in the wild disagrees.
    return bytes ? new TextDecoder('utf-8').decode(bytes) : null
  }

  async blobOf(name: string, type: string): Promise<Blob | null> {
    const bytes = await this.bytesOf(name)
    return bytes ? new Blob([bytes as BlobPart], { type }) : null
  }

  /**
   * Find the end-of-central-directory record and read every entry from it.
   *
   * The record is at the very end unless the archive has a comment, so it is
   * searched for backwards over the last 64 KB — the most a comment can be.
   */
  private readDirectory(): void {
    const size = this.bytes.length
    if (size < 22) throw new Error('That file is too small to be a document.')

    let eocd = -1
    const floor = Math.max(0, size - 22 - 0xffff)
    for (let i = size - 22; i >= floor; i -= 1) {
      if (this.view.getUint32(i, true) === END_OF_CENTRAL) {
        eocd = i
        break
      }
    }
    if (eocd < 0) throw new Error('That doesn’t look like a Word or OpenDocument file.')

    let count = this.view.getUint16(eocd + 10, true)
    let directoryAt = this.view.getUint32(eocd + 16, true)

    // ZIP64. A .docx never needs it, but a .odt with a few hundred megabytes of
    // embedded images can, and the 32-bit fields read as 0xffffffff when it
    // does — which without this points the directory scan at nothing.
    if (directoryAt === 0xffffffff || count === 0xffff) {
      for (let i = eocd - 20; i >= 0; i -= 1) {
        if (this.view.getUint32(i, true) === ZIP64_END_LOCATOR) {
          const zip64At = Number(this.view.getBigUint64(i + 8, true))
          count = Number(this.view.getBigUint64(zip64At + 32, true))
          directoryAt = Number(this.view.getBigUint64(zip64At + 48, true))
          break
        }
      }
    }

    let cursor = directoryAt
    for (let i = 0; i < count; i += 1) {
      if (cursor + 46 > size || this.view.getUint32(cursor, true) !== CENTRAL_HEADER) break
      const method = this.view.getUint16(cursor + 10, true)
      const compressedSize = this.view.getUint32(cursor + 20, true)
      const nameLength = this.view.getUint16(cursor + 28, true)
      const extraLength = this.view.getUint16(cursor + 30, true)
      const commentLength = this.view.getUint16(cursor + 32, true)
      const offset = this.view.getUint32(cursor + 42, true)
      // Names are UTF-8 when bit 11 of the flags is set and CP437 otherwise.
      // Every part path we look up is ASCII, where the two agree, so decoding
      // as UTF-8 throughout is safe and saves carrying a CP437 table.
      const name = new TextDecoder('utf-8').decode(
        this.bytes.subarray(cursor + 46, cursor + 46 + nameLength),
      )
      this.entries.set(name, { name, method, offset, compressedSize })
      cursor += 46 + nameLength + extraLength + commentLength
    }

    if (!this.entries.size) throw new Error('That archive has nothing in it.')
  }
}

/**
 * Raw DEFLATE, via the browser.
 *
 * 'deflate-raw' rather than 'deflate': ZIP stores the bare compressed stream
 * with no zlib header or Adler checksum around it, and asking for 'deflate'
 * makes the browser reject the first two bytes as a bad header.
 */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Whether the browser can read ZIP-based documents at all. */
export function unzipSupported(): boolean {
  return typeof DecompressionStream !== 'undefined'
}
