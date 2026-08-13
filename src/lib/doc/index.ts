// ---------------------------------------------------------------------------
// The Files pipeline: read anything → RichDoc (or a Grid) → write anything.
//
// This file is the only place that knows which inputs pair with which outputs.
// Everything either side of it is ignorant of the other, which is what keeps a
// tenth input format to one new file.
//
// EVERY READER IS LAZILY IMPORTED. Together they are a fair amount of code —
// a CFB reader, an RTF tokeniser, two XML dialects — and somebody who opened
// the app to convert a JPEG should not download any of it. Dynamic `import()`
// puts each in its own chunk, fetched the first time a file of that type is
// converted, and never on the audio, images or video tabs. That is the same
// bargain LAME strikes, except these are already in the bundle rather than
// coming from npm, so it works offline: the service worker precaches them.
//
// ⚠️ THIS STACK EXISTS TWICE IN THE SUITE. Universal PDF shipped its own office
// import — `unzip.ts`, `officeXml.ts`, `docxToBlocks.ts`, `odtToBlocks.ts`,
// `blockPdf.ts` — at 16:24 on 2026-08-13 (commit c1f3faa), the same afternoon
// this landed, from a parallel session neither could see. The ZIP reader, the
// XML helpers, the OOXML/ODF walkers and the layout engine all overlap.
//
// They are not identical: this side reads .doc, .rtf, .csv, .json, .txt, .md and
// .html, embeds images, and writes with NO dependency; that side refuses .doc and
// .rtf and renders through pdf-lib. Consolidating them into @unisim/sdk is an
// open backlog item ("Universal Converter" in backlog-unisim.md). Until it is
// done, A FIX HERE IS A FIX TO NEITHER — check the twin.
// ---------------------------------------------------------------------------

import { withExtension } from '../humanise'
import type { ConvertedFile } from '../types'
import type { DocNotice, Grid, RichDoc } from './model'
// ⚠️ From `pdfSettings`, NOT from `write/pdf`. A static import of the renderer
// here would cancel the dynamic one below and pull the whole layout engine and
// its font tables into the main bundle — see that file's header.
import { DEFAULT_PDF_SETTINGS, type PdfSettings } from './write/pdfSettings'

export type { PdfSettings, PaperSize, PageMargin, FontChoice } from './write/pdfSettings'
export { DEFAULT_PDF_SETTINGS } from './write/pdfSettings'
export type { DocNotice, RichDoc } from './model'

export type DocFormat = 'pdf' | 'txt' | 'html' | 'md' | 'csv' | 'json'

export interface DocSettings {
  format: DocFormat
  pdf: PdfSettings
  /** CSV → JSON: read "42" as a number rather than a string. */
  inferTypes: boolean
}

export const DEFAULT_DOC_SETTINGS: DocSettings = {
  format: 'pdf',
  pdf: DEFAULT_PDF_SETTINGS,
  inferTypes: true,
}

/** What came out, plus anything the person should be told about it. */
export interface DocResult extends ConvertedFile {
  notices: DocNotice[]
  pages?: number
}

// ── What reads what ──────────────────────────────────────────────────────────

/**
 * Input extensions, grouped by the shape of what they produce.
 *
 * `tabular` sources also yield a `Grid`, which is the only thing that can
 * become CSV or JSON. Everything else is a document, and asking for CSV from a
 * Word file is refused by the UI rather than answered with a one-column sheet
 * of its paragraphs.
 */
export const DOC_INPUT_EXTS = [
  'docx', 'doc', 'odt', 'rtf', 'txt', 'text', 'log', 'md', 'markdown',
  'html', 'htm', 'csv', 'tsv', 'json',
] as const

const TABULAR_EXTS = new Set(['csv', 'tsv', 'json'])

export function isTabular(ext: string): boolean {
  return TABULAR_EXTS.has(ext)
}

/** The targets a given input can actually reach. */
export function targetsFor(ext: string): DocFormat[] {
  if (ext === 'csv' || ext === 'tsv') return ['pdf', 'json', 'html', 'md', 'txt']
  if (ext === 'json') return ['pdf', 'csv', 'html', 'md', 'txt']
  // A document has no grid behind it, so CSV and JSON are not on offer.
  return ['pdf', 'txt', 'html', 'md']
}

/** Targets reachable by every file in a mixed queue. */
export function commonTargets(exts: readonly string[]): DocFormat[] {
  if (!exts.length) return ['pdf', 'txt', 'html', 'md']
  return exts
    .map(targetsFor)
    .reduce((shared, next) => shared.filter((f) => next.includes(f)))
}

interface Source {
  doc: RichDoc
  grid: Grid | null
}

/**
 * Read a file to a RichDoc, whichever kind it is.
 *
 * The one entry point the "join into one PDF" export needs — it wants the model
 * and not a converted file, so that it can concatenate before writing once.
 */
export async function readToDoc(file: File): Promise<RichDoc> {
  return (await read(file, extensionOf(file.name))).doc
}

async function read(file: File, ext: string): Promise<Source> {
  switch (ext) {
    case 'docx': {
      const { readDocx } = await import('./read/docx')
      return { doc: await readDocx(file), grid: null }
    }
    case 'doc': {
      const { readDoc } = await import('./read/doc')
      return { doc: await readDoc(file), grid: null }
    }
    case 'odt': {
      const { readOdt } = await import('./read/odt')
      return { doc: await readOdt(file), grid: null }
    }
    case 'rtf': {
      const { readRtf } = await import('./read/rtf')
      return { doc: await readRtf(file), grid: null }
    }
    case 'md':
    case 'markdown': {
      const { readMarkdown } = await import('./read/markdown')
      return { doc: await readMarkdown(file), grid: null }
    }
    case 'html':
    case 'htm': {
      const { readHtml } = await import('./read/html')
      return { doc: await readHtml(file), grid: null }
    }
    case 'csv':
    case 'tsv': {
      const { readCsv } = await import('./read/csv')
      const { doc, grid } = await readCsv(file)
      return { doc, grid }
    }
    case 'json': {
      const { readJson } = await import('./read/json')
      const { doc, grid } = await readJson(file)
      return { doc, grid }
    }
    case 'txt':
    case 'text':
    case 'log': {
      const { readText } = await import('./read/text')
      return { doc: await readText(file), grid: null }
    }
    default:
      throw new Error(`${ext ? ext.toUpperCase() : 'That file type'} isn’t a document this can read.`)
  }
}

// ── The conversion ───────────────────────────────────────────────────────────

export async function convertDocument(
  file: File,
  settings: DocSettings,
  onProgress?: (fraction: number) => void,
): Promise<DocResult> {
  const ext = extensionOf(file.name)
  onProgress?.(0.05)

  const { doc, grid } = await read(file, ext)
  // Reading is most of the work for the formats that need unzipping and
  // decoding; writing is fast. The split reflects that rather than pretending
  // to know a percentage it cannot measure.
  onProgress?.(0.65)

  const notices = [...doc.notices]
  const name = (extension: string) => withExtension(file.name, extension)

  switch (settings.format) {
    case 'pdf': {
      const { docToPdf } = await import('./write/pdf')
      const result = await docToPdf(doc, settings.pdf)
      if (result.dropped.length) {
        // Named, not counted. "12 characters could not be written" sends
        // somebody hunting; showing them the actual glyphs makes it obvious
        // at a glance that it was the Greek in one footnote.
        const sample = result.dropped.slice(0, 12).join(' ')
        notices.push({
          severity: 'loss',
          message:
            `Some characters aren’t in the PDF’s built-in fonts and came out as “?”: ${sample}` +
            (result.dropped.length > 12 ? ` and ${result.dropped.length - 12} more.` : '.') +
            ' Those alphabets need a font embedded in the file, which this converter doesn’t do.',
        })
      }
      onProgress?.(1)
      return { blob: result.blob, name: name('pdf'), notices, pages: result.pages }
    }

    case 'txt': {
      const { docToText } = await import('./write/text')
      onProgress?.(1)
      return { blob: textBlob(docToText(doc), 'text/plain'), name: name('txt'), notices }
    }

    case 'html': {
      const { docToHtml } = await import('./write/text')
      onProgress?.(1)
      return { blob: textBlob(docToHtml(doc), 'text/html'), name: name('html'), notices }
    }

    case 'md': {
      const { docToMarkdown } = await import('./write/text')
      onProgress?.(1)
      return { blob: textBlob(docToMarkdown(doc), 'text/markdown'), name: name('md'), notices }
    }

    case 'csv': {
      if (!grid) throw new Error('Only a spreadsheet-shaped file can become a CSV.')
      const { gridToCsv } = await import('./write/data')
      onProgress?.(1)
      return { blob: csvBlob(gridToCsv(grid)), name: name('csv'), notices }
    }

    case 'json': {
      if (!grid) throw new Error('Only a spreadsheet-shaped file can become JSON.')
      const { gridToJson } = await import('./write/data')
      onProgress?.(1)
      return {
        blob: textBlob(gridToJson(grid, { inferTypes: settings.inferTypes }), 'application/json'),
        name: name('json'),
        notices,
      }
    }
  }
}

function textBlob(text: string, type: string): Blob {
  return new Blob([text], { type: `${type};charset=utf-8` })
}

/**
 * A CSV, and the ONE place a byte-order mark is written.
 *
 * ⚠️ Excel opens a UTF-8 CSV as Windows-1252 unless the file starts with a BOM,
 * so "Ré" arrives as "RÃ©" for anybody who double-clicks the result — and
 * double-clicking it is what a CSV is for. The BOM is NOT put on the other text
 * targets, and specifically not on JSON: RFC 8259 forbids one, and `JSON.parse`
 * throws on a string that has it, so the tidy-looking "put it on everything"
 * rule would hand back JSON that will not load.
 */
function csvBlob(text: string): Blob {
  return new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' })
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot < 1 || dot === filename.length - 1) return ''
  return filename.slice(dot + 1).toLowerCase()
}
