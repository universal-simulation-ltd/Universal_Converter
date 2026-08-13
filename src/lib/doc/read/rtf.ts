// ---------------------------------------------------------------------------
// RTF → RichDoc.
//
// RTF is a text format with braces, which makes it look far more tractable than
// the binary .doc — and it mostly is. A tokeniser over `\control`, `{group}`
// and literal text gets bold, italic, underline, paragraphs and headings, which
// is most of what a converted document needs.
//
// THREE THINGS THAT ARE NOT OBVIOUS AND BREAK IT IF MISSED
// --------------------------------------------------------
//   * FORMATTING IS SCOPED TO THE GROUP. `{\b bold}` ends when the brace does,
//     so state has to be pushed and popped with the braces rather than tracked
//     flat. Flat tracking makes one stray `\b` bold the rest of the document.
//   * `\'xx` IS A BYTE, NOT A CHARACTER, and which character it is depends on
//     the document's codepage (`\ansicpg1252`). Bytes are collected and decoded
//     as a group so a multi-byte sequence survives.
//   * DESTINATIONS MUST BE SKIPPED. `{\fonttbl…}`, `{\colortbl…}`, `{\*\…}` and
//     `{\stylesheet…}` are all text that is NOT document text; without skipping
//     them a converted file opens with a list of every font it uses.
//
// Pictures are not read. `\pict` holds hex-encoded WMF or PNG, and the WMF half
// browsers cannot draw at all, so the group is skipped and a notice is raised.
// ---------------------------------------------------------------------------

import { addNotice, mergeRuns, tidy, type Block, type ListItem, type RichDoc, type Run } from '../model'

/** Groups whose contents are metadata rather than document text. */
const SKIPPED_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'listtable', 'listoverridetable',
  'info', 'pict', 'header', 'footer', 'headerl', 'headerr', 'headerf',
  'footerl', 'footerr', 'footerf', 'footnote', 'comment', 'generator',
  'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl',
  'nonshppict', 'shppict', 'field', 'filetbl', 'revtbl', 'annotation',
  'bkmkstart', 'bkmkend', 'template', 'atnid', 'atnauthor',
])

interface State {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  /** Outline level from `\outlinelevelN`, or the `\sN` heading styles. */
  heading: number
  list: boolean
  /** Set while inside a destination whose text is thrown away. */
  skip: boolean
  /** Bytes per `\'xx` character, from `\ucN`. */
  unicodeSkip: number
}

export async function readRtf(file: File): Promise<RichDoc> {
  const source = await file.text()
  if (!source.startsWith('{\\rt')) {
    throw new Error('This doesn’t look like an RTF file inside.')
  }

  const doc: RichDoc = { blocks: [], notices: [] }
  const codepage = /\\ansicpg(\d+)/.exec(source)?.[1] ?? '1252'
  const decoder = makeDecoder(codepage)

  const stack: State[] = []
  let state: State = {
    bold: false, italic: false, underline: false, strike: false,
    heading: 0, list: false, skip: false, unicodeSkip: 1,
  }

  let runs: Run[] = []
  let pendingBytes: number[] = []
  let sawPicture = false
  let listItems: ListItem[] = []
  let listOrdered = false

  const flushBytes = () => {
    if (!pendingBytes.length) return
    const text = decoder(new Uint8Array(pendingBytes))
    pendingBytes = []
    if (!state.skip) runs.push({ text, ...styleOf(state) })
  }

  const flushList = () => {
    if (listItems.length) {
      doc.blocks.push({ kind: 'list', ordered: listOrdered, items: listItems })
      listItems = []
    }
  }

  const endParagraph = () => {
    flushBytes()
    const merged = mergeRuns(runs)
    runs = []
    if (!merged.length) {
      flushList()
      doc.blocks.push({ kind: 'paragraph', runs: [{ text: ' ' }] })
      return
    }
    if (state.list) {
      listItems.push({ runs: merged, level: 0 })
      return
    }
    flushList()
    if (state.heading > 0) {
      const level = Math.min(4, Math.max(1, state.heading)) as 1 | 2 | 3 | 4
      doc.blocks.push({ kind: 'heading', level, runs: merged })
    } else {
      doc.blocks.push({ kind: 'paragraph', runs: merged } satisfies Block)
    }
  }

  let i = 0
  while (i < source.length) {
    const ch = source[i]

    if (ch === '{') {
      flushBytes()
      stack.push({ ...state })
      i += 1
      continue
    }

    if (ch === '}') {
      flushBytes()
      const restored = stack.pop()
      if (restored) state = restored
      i += 1
      continue
    }

    if (ch === '\\') {
      // An escaped literal: \\ \{ \} are the characters themselves.
      const next = source[i + 1]
      if (next === '\\' || next === '{' || next === '}') {
        pendingBytes.push(next.charCodeAt(0))
        i += 2
        continue
      }

      // A hex byte.
      if (next === "'") {
        const hex = source.slice(i + 2, i + 4)
        pendingBytes.push(parseInt(hex, 16) || 0)
        i += 4
        continue
      }

      // ⚠️ `\*` MUST BE HANDLED HERE, before the control-word regex, and the
      // reason is worth keeping: `*` is not a letter, so the regex below does
      // not match it, and the fallthrough consumed the backslash and then
      // treated the `*` as ORDINARY TEXT. Every `{\*\generator …}` and
      // `{\*\listtable …}` LibreOffice writes therefore contributed a literal
      // asterisk, and a converted RTF opened with "*****" before its title.
      // It means "skip this group unless you know the destination", and we
      // know none of them.
      if (next === '*') {
        flushBytes()
        state.skip = true
        i += 2
        continue
      }

      const match = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(source.slice(i))
      if (!match) {
        i += 1
        continue
      }
      flushBytes()
      const word = match[1]
      const value = match[2] === undefined ? null : Number(match[2])
      i += match[0].length

      // A destination marker: `{\*\foo …}` means "skip this whole group if you
      // don't know \foo", which for our purposes is always.
      if (word === '*') {
        state.skip = true
        continue
      }

      if (SKIPPED_DESTINATIONS.has(word)) {
        if (word === 'pict') sawPicture = true
        state.skip = true
        continue
      }

      switch (word) {
        case 'par':
        case 'sect':
          endParagraph()
          break
        case 'line':
          if (!state.skip) runs.push({ text: '\n', ...styleOf(state) })
          break
        case 'page':
          endParagraph()
          doc.blocks.push({ kind: 'pagebreak' })
          break
        case 'tab':
          if (!state.skip) runs.push({ text: '  ', ...styleOf(state) })
          break
        case 'b': state.bold = value !== 0; break
        case 'i': state.italic = value !== 0; break
        case 'ul': state.underline = value !== 0; break
        case 'ulnone': state.underline = false; break
        case 'strike': state.strike = value !== 0; break
        case 'plain':
          state.bold = state.italic = state.underline = state.strike = false
          break
        case 'outlinelevel':
          state.heading = value === null ? 0 : value + 1
          break
        case 's':
          // `\s1`–`\s9` are the built-in heading styles in almost every
          // producer's stylesheet. Not guaranteed, but right far more often
          // than treating a styled heading as body text.
          state.heading = value !== null && value >= 1 && value <= 9 ? value : 0
          break
        case 'pard':
          // Resets paragraph formatting — including list membership and any
          // heading level, which is what ends a list.
          state.heading = 0
          state.list = false
          break
        case 'ls':
        case 'listtext':
          state.list = true
          break
        case 'pntext':
          // The literal bullet or number a non-list-aware reader should show.
          // Skipped, because the writers draw their own markers and this would
          // double them up.
          state.skip = true
          break
        case 'pnlvlblt':
          listOrdered = false
          state.list = true
          break
        case 'pnlvlbody':
          listOrdered = true
          state.list = true
          break
        case 'u': {
          // A Unicode character, given as a SIGNED 16-bit value — so 8212
          // (em dash) arrives fine but anything above U+7FFF arrives negative.
          if (value !== null && !state.skip) {
            const code = value < 0 ? value + 65536 : value
            runs.push({ text: String.fromCharCode(code), ...styleOf(state) })
          }
          // `\uc` says how many CHARACTERS of ANSI fallback follow, spelling
          // the same glyph for a reader too old to understand `\u`. They must
          // be swallowed or the document gets the character twice.
          i = skipFallback(source, i, state.unicodeSkip)
          break
        }
        case 'uc':
          state.unicodeSkip = value ?? 1
          break
        case 'cell':
          if (!state.skip) runs.push({ text: '  ', ...styleOf(state) })
          break
        case 'row':
          endParagraph()
          break
        default:
          break
      }
      continue
    }

    if (ch === '\n' || ch === '\r') {
      i += 1
      continue
    }

    pendingBytes.push(ch.charCodeAt(0))
    i += 1
  }

  endParagraph()
  flushList()

  if (sawPicture) {
    addNotice(doc, 'Pictures were left out — RTF stores them in a Windows format browsers can’t draw.')
  }
  // RTF's tables are rows of cells with no structure around them, so they come
  // through as tab-separated lines rather than as a laid-out grid.
  if (/\\trowd/.test(source)) {
    addNotice(doc, 'Tables came through as plain lines — RTF doesn’t describe them as a grid.')
  }

  if (!doc.blocks.length) throw new Error('No readable text was found in this RTF.')
  doc.title = /\{\\title ([^}]*)\}/.exec(source)?.[1]?.trim() || undefined
  return tidy(doc)
}

/**
 * Step over the ANSI fallback that follows a `\uN`.
 *
 * ⚠️ `\uc1` means ONE CHARACTER, NOT ONE STRING POSITION, and conflating the
 * two is the bug this function exists to prevent. The fallback for an em dash
 * is written `\'97` — four characters spelling one byte — so advancing the
 * cursor by `unicodeSkip` left `'97` behind as literal text, and every em dash
 * in a converted RTF came out as `—'97`. A fallback character can be:
 *
 *   \'xx   a hex byte, four characters
 *   \\ \{  an escaped literal, two characters
 *   x      an ordinary character, one
 *
 * A control word among them ends the run early — it is the next instruction,
 * not a fallback — so the loop stops rather than eating it.
 */
function skipFallback(source: string, at: number, count: number): number {
  let i = at
  for (let n = 0; n < count && i < source.length; n += 1) {
    if (source[i] === '\\') {
      const next = source[i + 1]
      if (next === "'") { i += 4; continue }
      if (next === '\\' || next === '{' || next === '}') { i += 2; continue }
      break
    }
    if (source[i] === '{' || source[i] === '}') break
    i += 1
  }
  return i
}

function styleOf(state: State): Partial<Run> {
  const style: Partial<Run> = {}
  if (state.bold) style.bold = true
  if (state.italic) style.italic = true
  if (state.underline) style.underline = true
  if (state.strike) style.strike = true
  return style
}

/**
 * A decoder for the document's declared codepage.
 *
 * `TextDecoder` knows these by their web names, and an unknown one throws
 * rather than falling back — so an exotic `\ansicpg` would take the whole
 * conversion down. Windows-1252 is the overwhelmingly common case and a decent
 * last resort.
 */
function makeDecoder(codepage: string): (bytes: Uint8Array) => string {
  const label = codepage === '65001' ? 'utf-8' : `windows-${codepage}`
  try {
    const decoder = new TextDecoder(label)
    return (bytes) => decoder.decode(bytes)
  } catch {
    const fallback = new TextDecoder('windows-1252')
    return (bytes) => fallback.decode(bytes)
  }
}
