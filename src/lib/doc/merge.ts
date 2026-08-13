// ---------------------------------------------------------------------------
// Several documents → one PDF.
//
// Deliberately NOT a second pipeline. Each file goes through the same reader it
// would on its own, the resulting RichDocs are concatenated into one, and that
// goes through the same writer with the same settings. The only thing this file
// adds is the join: a page break between documents and a heading naming each.
//
// The alternative — writing each to its own PDF and stitching the byte streams
// — needs a PDF *parser* to renumber every object, which is the thing
// `pdfcore.ts` explicitly does not do. Joining at the model level is both less
// code and a better result: the page numbers run 1..n across the whole thing
// rather than restarting per document.
// ---------------------------------------------------------------------------

import { addNotice, type RichDoc } from './model'
import { docToPdf } from './write/pdf'
import type { PdfSettings } from './write/pdfSettings'

export interface MergePart {
  name: string
  doc: RichDoc
}

/** Read one file to a RichDoc, whichever kind it is. */
export async function readForMerge(file: File): Promise<MergePart> {
  const { readToDoc } = await import('./index')
  return { name: file.name, doc: await readToDoc(file) }
}

export async function mergeToPdf(
  parts: readonly MergePart[],
  settings: PdfSettings,
): Promise<{ blob: Blob; pages: number; notices: RichDoc['notices'] }> {
  if (!parts.length) throw new Error('There are no documents to join.')

  const merged: RichDoc = { blocks: [], notices: [], title: 'Documents' }

  parts.forEach((part, index) => {
    // A page break BEFORE each document except the first: putting one after
    // each instead leaves a blank final page.
    if (index > 0) merged.blocks.push({ kind: 'pagebreak' })
    // The filename as a heading. Without it a joined PDF is one undifferentiated
    // run of text and there is no way to tell where one document ended.
    merged.blocks.push({
      kind: 'heading',
      level: 1,
      runs: [{ text: part.name.replace(/\.[^.]+$/, '') }],
    })
    merged.blocks.push(...part.doc.blocks)
    for (const notice of part.doc.notices) {
      // Prefixed with the filename: in a joined batch "only its text could be
      // read" is useless without knowing which of the six it refers to.
      addNotice(merged, `${part.name}: ${notice.message}`, notice.severity)
    }
  })

  const result = await docToPdf(merged, settings)
  if (result.dropped.length) {
    addNotice(
      merged,
      `Some characters aren’t in the PDF’s built-in fonts and came out as “?”: ${result.dropped.slice(0, 12).join(' ')}`,
    )
  }
  return { blob: result.blob, pages: result.pages, notices: merged.notices }
}
