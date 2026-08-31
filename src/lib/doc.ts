// ---------------------------------------------------------------------------
// The document stack, and the one thing this app adds to it.
//
// The stack itself now lives in `@unisim/doc` — model, nine readers, six
// writers, and the PDF layout engine. It moved there on 2026-08-20 because
// Universal PDF had grown its own copy of the same 1,200-odd lines on the same
// afternoon this one shipped, and the two were already diverging. See that
// package's README for the whole story.
//
// What stays here is the part that is genuinely this app's: **naming the output
// file**. `convertDocument` deliberately hands back a target EXTENSION rather
// than a filename, because a library that named files would be a second opinion
// on a question that has already cost this repo a `.png.png` hunt. The app owns
// `withExtension`, so the app applies it — and the names asserted by
// `e2e/images.e2e.mjs` keep coming from one place.
// ---------------------------------------------------------------------------

import {
  convertDocument as convertDocumentToBlob,
  type DocResult as PackageDocResult,
  type DocSettings,
} from '@unisim/doc'
import { loadFallbackFont } from './fallbackFont'
import { withExtension } from './humanise'
import type { ConvertedFile } from './types'

// Everything else the app imported from the old local `doc/` folder, forwarded
// unchanged so no call site had to move.
export {
  DEFAULT_DOC_SETTINGS,
  DEFAULT_PDF_SETTINGS,
  DOC_INPUT_EXTS,
  commonTargets,
  isTabular,
  mergeToPdf,
  readForMerge,
  readToDoc,
  targetsFor,
} from '@unisim/doc'
export type {
  Block,
  DocFormat,
  DocNotice,
  DocSettings,
  FontChoice,
  Grid,
  MergePart,
  PageMargin,
  PaperSize,
  PdfSettings,
  RichDoc,
  Run,
} from '@unisim/doc'

/** A converted document, named the way this app names things. */
export interface DocResult extends ConvertedFile {
  notices: PackageDocResult['notices']
  pages?: number
}

export async function convertDocument(
  file: File,
  settings: DocSettings,
  onProgress?: (fraction: number) => void,
): Promise<DocResult> {
  // The fourth argument is the fallback FACE — see `fallbackFont.ts`. The
  // package calls it only when a document contains something the base-14 fonts
  // cannot spell, so an English conversion never fetches it.
  const result = await convertDocumentToBlob(file, settings, onProgress, loadFallbackFont)
  return {
    blob: result.blob,
    name: withExtension(file.name, result.ext),
    notices: result.notices,
    pages: result.pages,
  }
}
