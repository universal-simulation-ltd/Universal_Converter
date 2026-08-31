// Kept as this app's save entry point so no call site had to change. The
// mechanics — and the reason a phone needs a different one entirely — live in
// `saveFile.ts`.
import { saveBlob as save, saveBlobAs as saveAs } from './saveFile'

export { canPickSaveLocation } from './saveFile'

/** Save a blob to the user's downloads, or to the share sheet on a phone.
 *  Nothing here touches the network. */
export function saveBlob(blob: Blob, filename: string): void {
  save(blob, filename)
}

/** Save a blob wherever the user points the file dialog. See `saveFile.ts` —
 *  it falls back to `saveBlob` in a browser with no picker, and the caller is
 *  expected to have asked `canPickSaveLocation()` before saying "dialog" in a
 *  label. Nothing here touches the network either. */
export function saveBlobAs(blob: Blob, filename: string): Promise<void> {
  return saveAs(blob, filename)
}
