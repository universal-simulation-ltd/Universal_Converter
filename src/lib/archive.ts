/**
 * What goes into a ZIP of converted files, and what the ZIP is called.
 *
 * Pure, so `scripts/selftest.mjs` pins it without a browser.
 *
 * A file that came in from a dropped (or picked) FOLDER goes back out at the
 * same place in the tree — `Holiday/Day 1/IMG_0001.jpg` in,
 * `Holiday/Day 1/IMG_0001.webp` out — which is the point of dropping a folder
 * rather than its contents (James, 2026-09-27). A loose file sits at the top,
 * as it always did.
 */

export interface Finished {
  /** `"Holiday/Day 1/"`, or `""` for a file that was not in a folder. */
  folder: string
  /** The converted file's own name. */
  name: string
  blob: Blob
}

/**
 * The archive's entries, one per finished file, every path unique.
 *
 * ⚠️ Two files CAN want the same path: `photo.png` and `photo.heic` side by
 * side both become `photo.jpg`. A ZIP with two entries of one name is legal
 * and unpacks as one file silently overwriting the other — so the second is
 * numbered, the way a file manager numbers a copy. Compared without regard to
 * case, because that is how the disks most people unpack onto compare.
 */
export function archiveEntries(rows: readonly Finished[]): { name: string; blob: Blob }[] {
  const taken = new Set<string>()
  return rows.map((row) => {
    let path = row.folder + row.name
    if (taken.has(path.toLowerCase())) {
      const dot = row.name.lastIndexOf('.')
      const stem = dot > 0 ? row.name.slice(0, dot) : row.name
      const ext = dot > 0 ? row.name.slice(dot) : ''
      for (let n = 2; taken.has(path.toLowerCase()); n += 1) path = `${row.folder}${stem} (${n})${ext}`
    }
    taken.add(path.toLowerCase())
    return { name: path, blob: row.blob }
  })
}

/**
 * The archive's file name: `converted.zip`, or `Holiday-converted.zip` when
 * every file came out of the one folder called Holiday — so a folder dropped
 * in comes back out under its own name, not as the fourth `converted.zip` in
 * the downloads folder.
 */
export function archiveName(rows: readonly Finished[], suffix: string): string {
  const tops = new Set(rows.map((r) => r.folder.split('/')[0] ?? ''))
  const [top] = tops
  return tops.size === 1 && top ? `${top}-${suffix}.zip` : `${suffix}.zip`
}
