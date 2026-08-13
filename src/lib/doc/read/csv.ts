// ---------------------------------------------------------------------------
// CSV → Grid (and a RichDoc table).
//
// A real RFC 4180 parser rather than `split(',')`, because the split version
// works on every file you test it with and fails on the first real one: a
// quoted field can contain the delimiter, a newline, and — the part that trips
// most hand-rolled parsers — an escaped quote, written as TWO quotes inside a
// quoted field. `"He said ""no"", then left"` is one field.
//
// The delimiter is SNIFFED rather than assumed. A "CSV" exported from Excel in
// most of Europe is semicolon-separated, because the comma is the decimal point
// there, and a tab-separated file is routinely named .csv too.
// ---------------------------------------------------------------------------

import { tidy, type Block, type Grid, type RichDoc, type Run } from '../model'

export interface CsvResult {
  doc: RichDoc
  grid: Grid
}

export async function readCsv(file: File): Promise<CsvResult> {
  return parseCsvFile(await file.text(), file.name)
}

export function parseCsvFile(source: string, filename?: string): CsvResult {
  const text = source.replace(/^﻿/, '') // strip a UTF-8 BOM from Excel
  const delimiter = sniffDelimiter(text)
  const rows = parseCsv(text, delimiter)

  if (!rows.length) throw new Error('That CSV has no rows in it.')

  const hasHeader = looksLikeHeader(rows)
  const header = hasHeader ? rows[0] : []
  const body = hasHeader ? rows.slice(1) : rows
  const grid: Grid = { header, rows: body }

  const blocks: Block[] = [
    {
      kind: 'table',
      header: hasHeader ? header.map((cell): Run[] => [{ text: cell }]) : null,
      rows: body.map((row) => row.map((cell): Run[] => [{ text: cell }])),
    },
  ]

  const doc = tidy({
    blocks,
    notices: [],
    title: filename?.replace(/\.(csv|tsv|tab)$/i, ''),
  })
  return { doc, grid }
}

/**
 * Split a CSV into rows and fields.
 *
 * One pass, one state flag. `inQuotes` decides what every character means, and
 * the doubled-quote rule is handled by peeking one ahead rather than by a
 * second flag — inside quotes, `""` is a literal quote and a lone `"` ends the
 * field.
 */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"' && field === '') { inQuotes = true; i += 1; continue }
    if (ch === delimiter) { row.push(field); field = ''; i += 1; continue }
    if (ch === '\r') { i += 1; continue }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }
    field += ch
    i += 1
  }

  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }

  // A trailing newline gives a final row of one empty field. Dropping it is
  // right; dropping a genuinely empty row in the MIDDLE would not be, so this
  // only looks at the last.
  const last = rows[rows.length - 1]
  if (last && last.length === 1 && last[0] === '') rows.pop()

  return rows
}

/**
 * Which delimiter is this file using?
 *
 * Counted over the first few lines OUTSIDE quotes — a comma inside a quoted
 * address would otherwise outvote the semicolons actually separating the
 * fields. Whichever candidate divides the file into the most consistent number
 * of columns wins, which beats a raw count when one character is simply common
 * in the prose.
 */
function sniffDelimiter(text: string): string {
  const sample = text.split('\n').slice(0, 20).join('\n')
  let best = ','
  let bestScore = -1

  for (const candidate of [',', ';', '\t', '|']) {
    const rows = parseCsv(sample, candidate).filter((r) => r.length > 0)
    if (rows.length < 1) continue
    const columns = rows[0].length
    if (columns < 2) continue
    const consistent = rows.filter((r) => r.length === columns).length / rows.length
    // Columns break ties: two candidates can both split every row evenly, and
    // the one producing more fields is the one actually delimiting.
    const score = consistent * 100 + Math.min(columns, 50)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

/**
 * Is row 0 a header?
 *
 * The signal that works: a header's cells are non-empty text, and the rows
 * below it contain numbers or dates where the header has words. A file whose
 * first row looks exactly like every other row probably has no header.
 */
function looksLikeHeader(rows: readonly string[][]): boolean {
  if (rows.length < 2) return true
  const first = rows[0]
  if (first.some((c) => !c.trim())) return false
  if (first.every((c) => isNumeric(c))) return false

  const numericBelow = rows.slice(1, 20).some((row) => row.some((c) => isNumeric(c)))
  const numericInHeader = first.some((c) => isNumeric(c))
  return numericBelow ? !numericInHeader : true
}

function isNumeric(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  return /^-?[\d.,]+%?$/.test(trimmed) && /\d/.test(trimmed)
}
