// Kept as this app's save entry point so no call site had to change. The
// mechanics — and the reason a phone needs a different one entirely — live in
// `saveFile.ts`.
import { saveBlob as save } from './saveFile'

/** Save a blob to the user's downloads, or to the share sheet on a phone.
 *  Nothing here touches the network. */
export function saveBlob(blob: Blob, filename: string): void {
  save(blob, filename)
}
