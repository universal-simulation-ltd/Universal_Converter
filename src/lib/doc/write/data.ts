// ---------------------------------------------------------------------------
// Grid → CSV and JSON.
//
// The two DATA targets, which deliberately never touch `RichDoc`. A CSV is rows
// of values, and routing it through a document model to get JSON back out would
// mean re-parsing the paragraphs it had been turned into — losing, on the way,
// the one thing JSON actually needs, which is what type each value is.
// ---------------------------------------------------------------------------

import type { Grid } from '../model'

export function gridToCsv(grid: Grid): string {
  const rows = grid.header.length ? [grid.header, ...grid.rows] : grid.rows
  // CRLF, per RFC 4180 — and because Excel on Windows is the overwhelmingly
  // likely destination, and it is the one that cares.
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/**
 * One cell, quoted only where it has to be.
 *
 * ⚠️ A LEADING SPACE COUNTS. A field that opens with whitespace loses it in
 * some readers unless it is quoted, and a field that ENDS with a lone quote
 * character needs quoting for the doubling rule to be unambiguous.
 */
function csvCell(value: string): string {
  const needsQuotes = /[",\r\n]/.test(value) || value !== value.trim()
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value
}

export interface JsonOptions {
  /** Turn "42" into 42 and "true" into true. */
  inferTypes: boolean
}

/**
 * A grid as an array of objects.
 *
 * Columns become keys. Where the source had no header row, the keys are
 * `column1`, `column2`… rather than the first row's values — using data as keys
 * silently deletes a row, and a file with no header is exactly the file where
 * every row matters.
 */
export function gridToJson(grid: Grid, options: JsonOptions = { inferTypes: true }): string {
  const columns = grid.header.length
    ? dedupe(grid.header)
    : Array.from({ length: Math.max(0, ...grid.rows.map((r) => r.length)) }, (_, i) => `column${i + 1}`)

  const records = grid.rows.map((row) => {
    const record: Record<string, unknown> = {}
    columns.forEach((key, i) => {
      record[key] = options.inferTypes ? inferType(row[i] ?? '') : (row[i] ?? '')
    })
    return record
  })

  return JSON.stringify(records, null, 2) + '\n'
}

/**
 * Column names, made unique.
 *
 * A spreadsheet cheerfully has two columns called "Notes"; a JSON object cannot,
 * and the second would silently overwrite the first — losing a whole column with
 * nothing to show for it.
 */
function dedupe(header: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return header.map((raw, i) => {
    const name = raw.trim() || `column${i + 1}`
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    return count ? `${name}_${count + 1}` : name
  })
}

/**
 * A cell's type, guessed conservatively.
 *
 * ⚠️ The rule that matters: A NUMBER ONLY BECOMES A NUMBER IF IT SURVIVES THE
 * ROUND TRIP. `007` and `+441632960000` and `1.10` are all "numeric" and all
 * come back changed — a leading zero gone, a plus sign gone, a trailing zero
 * gone. Those are product codes, phone numbers and prices, and quietly
 * corrupting them is far worse than leaving them as strings.
 */
function inferType(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null

  if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(trimmed)) {
    const number = Number(trimmed)
    if (Number.isFinite(number) && String(number) === trimmed) return number
  }
  return value
}
