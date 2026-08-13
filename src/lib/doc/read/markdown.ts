// ---------------------------------------------------------------------------
// Markdown → RichDoc.
//
// ⚠️ THIS IS A PORT, NOT A NEW PARSER. It is Universal PDF's
// `src/lib/markdownToPdf.ts` — its `parseMarkdown`, `parseInline` and
// `parseTableRow` — lifted out of that file's renderer and pointed at the
// RichDoc model instead of straight at pdf-lib. Deliberately kept recognisable:
// the block order, the regexes and the fenced-code handling are the same, so a
// bug found in one is findable in the other.
//
// (The obvious next move is one shared parser in `@unisim/sdk` that both apps
// import. That is a change to a shipped app for a benefit neither has yet, so
// it is written down in the backlog rather than done in passing here.)
//
// The additions on this side are nested lists — the model has a `level` and
// Universal PDF's flat `items` did not — and setext headings, which turn up in
// hand-written READMEs.
// ---------------------------------------------------------------------------

import { tidy, type Block, type ListItem, type RichDoc, type Run } from '../model'

export async function readMarkdown(file: File): Promise<RichDoc> {
  return parseMarkdownDoc(await file.text(), file.name)
}

export function parseMarkdownDoc(source: string, filename?: string): RichDoc {
  const doc: RichDoc = { blocks: parseBlocks(source), notices: [] }
  doc.title = guessTitle(source) || filename?.replace(/\.(md|markdown|mdown)$/i, '')
  return tidy(doc)
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i += 1; continue }

    // Fenced code. Taken first and taken whole: everything between the fences
    // is literal, so testing it for headings or lists would find markup that
    // the author wrote as an example.
    if (/^\s*(```|~~~)/.test(line)) {
      const fence = /^\s*(```|~~~)/.exec(line)![1]
      i += 1
      const buffer: string[] = []
      while (i < lines.length && !lines[i].trimStart().startsWith(fence)) {
        buffer.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push({ kind: 'code', text: buffer.join('\n') })
      continue
    }

    const atx = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line)
    if (atx) {
      blocks.push({ kind: 'heading', level: clampLevel(atx[1].length), runs: parseInline(atx[2]) })
      i += 1
      continue
    }

    // Setext: a line of text underlined with === or ---. Checked before the
    // horizontal rule, because `---` under a paragraph is a heading and `---`
    // on its own is a rule, and only the line above tells them apart.
    const underline = lines[i + 1]
    if (underline && /^\s*(=+|-{2,})\s*$/.test(underline) && !isBlockStart(line)) {
      blocks.push({
        kind: 'heading',
        level: underline.trim().startsWith('=') ? 1 : 2,
        runs: parseInline(line.trim()),
      })
      i += 2
      continue
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: 'rule' })
      i += 1
      continue
    }

    // A pipe table needs its separator row to be a table at all — otherwise a
    // paragraph that happens to contain pipes becomes a one-row grid.
    if (line.trimStart().startsWith('|') && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1] ?? '')) {
      const header = parseTableRow(line)
      i += 2
      const rows: Run[][][] = []
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        rows.push(parseTableRow(lines[i]))
        i += 1
      }
      blocks.push({ kind: 'table', header, rows })
      continue
    }

    if (/^\s*>/.test(line)) {
      const buffer: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buffer.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push({ kind: 'quote', runs: parseInline(buffer.join(' ')) })
      continue
    }

    const bullet = /^(\s*)([-*+])\s+/.exec(line)
    const numbered = /^(\s*)(\d+)[.)]\s+/.exec(line)
    if (bullet || numbered) {
      const ordered = !!numbered
      const items: ListItem[] = []
      while (i < lines.length) {
        const match = ordered
          ? /^(\s*)(\d+)[.)]\s+(.*)$/.exec(lines[i])
          : /^(\s*)([-*+])\s+(.*)$/.exec(lines[i])
        if (!match) {
          // A plain indented line continues the item above rather than starting
          // a new one — how a wrapped bullet is written by hand.
          if (items.length && /^\s{2,}\S/.test(lines[i]) && lines[i].trim()) {
            items[items.length - 1].runs.push({ text: ' ' }, ...parseInline(lines[i].trim()))
            i += 1
            continue
          }
          break
        }
        // Two spaces per level is the common convention, four is the other; a
        // divisor of 2 puts a four-space indent at level 2, which reads right
        // either way.
        items.push({ runs: parseInline(match[3]), level: Math.min(4, Math.floor(match[1].length / 2)) })
        i += 1
      }
      if (items.length) blocks.push({ kind: 'list', ordered, items })
      continue
    }

    // An indented code block: four spaces or a tab, run together.
    if (/^(\t| {4})/.test(line)) {
      const buffer: string[] = []
      while (i < lines.length && (/^(\t| {4})/.test(lines[i]) || !lines[i].trim())) {
        buffer.push(lines[i].replace(/^(\t| {4})/, ''))
        i += 1
      }
      while (buffer.length && !buffer[buffer.length - 1].trim()) buffer.pop()
      blocks.push({ kind: 'code', text: buffer.join('\n') })
      continue
    }

    const buffer: string[] = [line]
    i += 1
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      buffer.push(lines[i])
      i += 1
    }
    blocks.push({ kind: 'paragraph', runs: parseInline(buffer.join(' ')) })
  }

  return blocks
}

function clampLevel(n: number): 1 | 2 | 3 | 4 {
  return Math.min(4, Math.max(1, n)) as 1 | 2 | 3 | 4
}

function isBlockStart(line: string): boolean {
  if (!line.trim()) return false
  if (/^#{1,6}\s/.test(line)) return true
  if (/^\s*(```|~~~)/.test(line)) return true
  if (/^\s*>/.test(line)) return true
  if (/^\s*[-*+]\s+/.test(line)) return true
  if (/^\s*\d+[.)]\s+/.test(line)) return true
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return true
  if (line.trimStart().startsWith('|')) return true
  return false
}

/**
 * Inline emphasis, code, links and images.
 *
 * One regex with alternatives rather than a character-by-character scanner —
 * Universal PDF's approach, and right for the same reason: markdown emphasis
 * has no nesting rules worth honouring at this fidelity, and a scanner that
 * tried would spend most of its lines on cases nobody writes.
 */
function parseInline(text: string): Run[] {
  const runs: Run[] = []
  const PATTERN =
    /(\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~\n]+~~|`[^`\n]+`|!?\[[^\]\n]*\]\([^)\n]+\)|<https?:\/\/[^>\s]+>)/g

  let last = 0
  let match: RegExpExecArray | null
  while ((match = PATTERN.exec(text)) !== null) {
    if (match.index > last) runs.push({ text: text.slice(last, match.index) })
    const token = match[0]

    if (token.startsWith('***')) {
      runs.push({ text: token.slice(3, -3), bold: true, italic: true })
    } else if (token.startsWith('**') || token.startsWith('__')) {
      runs.push({ text: token.slice(2, -2), bold: true })
    } else if (token.startsWith('~~')) {
      runs.push({ text: token.slice(2, -2), strike: true })
    } else if (token[0] === '*' || token[0] === '_') {
      runs.push({ text: token.slice(1, -1), italic: true })
    } else if (token[0] === '`') {
      runs.push({ text: token.slice(1, -1), code: true })
    } else if (token[0] === '<') {
      const url = token.slice(1, -1)
      runs.push({ text: url, link: url })
    } else if (token.startsWith('!')) {
      // An image reference. The file it names is not in the drop, so the alt
      // text stands in — silently dropping it loses the caption too.
      const alt = /^!\[([^\]]*)\]/.exec(token)?.[1] ?? ''
      if (alt) runs.push({ text: `[${alt}]`, italic: true })
    } else {
      const link = /^\[([^\]]*)\]\(([^)\s]+)/.exec(token)
      if (link) runs.push({ text: link[1] || link[2], link: link[2] })
    }
    last = match.index + token.length
  }
  if (last < text.length) runs.push({ text: text.slice(last) })
  return runs.length ? runs : [{ text }]
}

function parseTableRow(line: string): Run[][] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => parseInline(cell.trim()))
}

function guessTitle(source: string): string | undefined {
  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const heading = /^#{1,3}\s+(.+)$/.exec(line)
    if (heading) return heading[1].replace(/[*_`]+/g, '').trim()
    break
  }
  return undefined
}
