/**
 * The files of a dropped or picked folder, in the order a file manager lists
 * them.
 *
 * Pure, so `scripts/selftest.mjs` pins it without a browser.
 *
 * ⚠️ A DRAGGED folder already arrives in this order — the SDK's walk sorts
 * every directory as it goes. A folder PICKED through "or choose a folder"
 * does not: `<input webkitdirectory>` hands back whatever order the disk
 * returned, and a queue of an album read 01, 14, 08, 11… (James, 2026-09-29).
 * Sorting here fixes the pick without changing the drag, because comparing
 * path segment by segment, numbers as numbers, is exactly what the walk does —
 * so a drag comes back from this unchanged.
 *
 * Only when EVERY file came out of a folder. A drop of loose files keeps the
 * order they were dropped in, and so does one mixing loose files and folders:
 * there is no one "file manager order" across the two.
 */
export function inFolderOrder<T extends { webkitRelativePath?: string }>(files: readonly T[]): T[] {
  const paths = files.map((f) => f.webkitRelativePath ?? '')
  if (files.length < 2 || paths.some((p) => !p.includes('/'))) return [...files]
  const split = paths.map((p) => p.split('/'))
  return files
    .map((file, i) => ({ file, parts: split[i] }))
    .sort((a, b) => {
      const n = Math.min(a.parts.length, b.parts.length)
      for (let i = 0; i < n; i += 1) {
        const c = a.parts[i].localeCompare(b.parts[i], undefined, { numeric: true })
        if (c !== 0) return c
      }
      return a.parts.length - b.parts.length
    })
    .map((x) => x.file)
}
