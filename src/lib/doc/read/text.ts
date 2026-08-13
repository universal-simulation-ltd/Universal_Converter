// ---------------------------------------------------------------------------
// Plain text → RichDoc.
//
// The smallest reader, and the one that has to guess most. A .txt has no
// structure at all, so the only question is what a BLANK LINE means — and the
// answer differs between a wrapped-at-72-columns file from an email client and
// a file with one paragraph per line from a note app. Both are common.
//
// The rule: a blank line always separates paragraphs. Within a block of lines,
// they are JOINED if the file looks hard-wrapped (most lines near the same
// length, none very long) and kept as separate lines otherwise. Joining a file
// that was not hard-wrapped ruins a list; not joining one that was gives a PDF
// with a ragged right edge every 72 characters.
// ---------------------------------------------------------------------------

import { tidy, type Block, type RichDoc } from '../model'

export async function readText(file: File): Promise<RichDoc> {
  return parseTextDoc(await file.text(), file.name)
}

export function parseTextDoc(source: string, filename?: string): RichDoc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  const rewrap = looksHardWrapped(lines)

  let buffer: string[] = []
  const flush = () => {
    if (!buffer.length) return
    const text = rewrap ? buffer.join(' ') : buffer.join('\n')
    blocks.push({ kind: 'paragraph', runs: [{ text }] })
    buffer = []
  }

  for (const line of lines) {
    if (!line.trim()) {
      flush()
      continue
    }
    buffer.push(line.replace(/\t/g, '    ').trimEnd())
  }
  flush()

  if (!blocks.length) throw new Error('That text file is empty.')
  return tidy({ blocks, notices: [], title: filename?.replace(/\.(txt|text|log)$/i, '') })
}

/**
 * Does this file look hard-wrapped at a fixed column?
 *
 * The test is the shape of the line lengths, not any one line: a hard-wrapped
 * file has most of its lines bunched just under a limit and none far over it.
 * A file of one-paragraph-per-line has a wide spread and long lines.
 */
function looksHardWrapped(lines: readonly string[]): boolean {
  const filled = lines.map((l) => l.trimEnd().length).filter((n) => n > 0)
  if (filled.length < 4) return false

  const longest = Math.max(...filled)
  if (longest > 120) return false // something is a full paragraph on one line

  // How many lines sit in the top quarter of the observed width. Hard wrapping
  // pushes almost every line there; free-form text does not.
  const nearLimit = filled.filter((n) => n >= longest * 0.75).length
  return nearLimit / filled.length > 0.6
}
