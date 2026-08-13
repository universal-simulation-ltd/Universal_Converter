// ---------------------------------------------------------------------------
// JSON → Grid (and a RichDoc).
//
// JSON is a TREE and a spreadsheet is a GRID, and only one shape of JSON is
// honestly both: an array of flat objects, which is what an API endpoint or a
// database export gives you. That case flattens perfectly, so it is the case
// this handles properly — union of every key as the columns, one row per
// element, in first-seen key order.
//
// Anything else is NOT forced into a grid. A nested object becomes its JSON
// text in the cell rather than being exploded into `address.city` columns:
// flattening reads well on the two records you tested and produces a
// four-hundred-column sheet on a real file, and there is no way to un-flatten
// it afterwards. For a document target, a non-tabular file is pretty-printed as
// a code block instead, which is at least readable.
// ---------------------------------------------------------------------------

import { tidy, type Block, type Grid, type RichDoc } from '../model'

export interface JsonResult {
  doc: RichDoc
  /** Null when the file is not an array of flat records. */
  grid: Grid | null
}

export async function readJson(file: File): Promise<JsonResult> {
  return parseJsonFile(await file.text(), file.name)
}

export function parseJsonFile(source: string, filename?: string): JsonResult {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (err) {
    // The parser's own message names the character offset, which is genuinely
    // the most useful thing anybody can be told about broken JSON.
    throw new Error(`That isn’t valid JSON — ${err instanceof Error ? err.message : 'it could not be parsed'}.`)
  }

  const title = filename?.replace(/\.json$/i, '')
  const grid = toGrid(value)
  const blocks: Block[] = []

  if (grid) {
    blocks.push({
      kind: 'table',
      header: grid.header.map((cell) => [{ text: cell }]),
      rows: grid.rows.map((row) => row.map((cell) => [{ text: cell }])),
    })
  } else {
    blocks.push({ kind: 'code', text: JSON.stringify(value, null, 2) })
  }

  const doc = tidy({ blocks, notices: [], title })
  if (!grid) {
    doc.notices.push({
      severity: 'info',
      message: 'This JSON isn’t a list of records, so it comes through as formatted text rather than a table. Only an array of flat objects converts to CSV.',
    })
  }
  return { doc, grid }
}

/**
 * The array-of-flat-objects case, or null.
 *
 * The columns are the union of every element's keys in FIRST-SEEN ORDER, not
 * the first element's keys: records with optional fields are normal, and taking
 * only the first record's shape silently drops every column that happens to be
 * absent from row one.
 */
function toGrid(value: unknown): Grid | null {
  const records = Array.isArray(value)
    ? value
    // A single object wrapping the real array — `{ "results": [ … ] }` — is
    // how most APIs answer, so one wrapper is unwrapped.
    : isRecord(value)
      ? Object.values(value).find((v) => Array.isArray(v) && v.length && isRecord(v[0]))
      : null

  if (!Array.isArray(records) || !records.length) return null
  if (!records.every(isRecord)) return null

  const header: string[] = []
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!header.includes(key)) header.push(key)
    }
  }
  if (!header.length) return null

  const rows = records.map((record) => header.map((key) => cellText(record[key])))
  return { header, rows }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * One value as a cell.
 *
 * `null` and `undefined` become empty rather than the strings "null" and
 * "undefined" — a blank cell is what a missing value means in a sheet. Nested
 * structures keep their JSON, so nothing is lost even though nothing is
 * flattened.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
