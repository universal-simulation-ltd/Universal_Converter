import type { FileDrop } from '@unisim/sdk'

/**
 * "Choose a folder" under a drop circle — the dialog's way in to what dragging
 * a folder onto the circle already does (James, 2026-09-27). The files keep
 * their place in the tree and come back out in it; see `lib/archive.ts`.
 *
 * Renders nothing where the browser cannot pick a folder — phones, whose
 * pickers take files only — rather than a button that opens the wrong dialog.
 */
export default function ChooseFolder({ drop }: { drop: FileDrop }) {
  if (!drop.canOpenFolder) return null
  return (
    <button
      type="button"
      onClick={drop.openFolder}
      className="rounded text-[11.5px] font-semibold text-orange-700 underline-offset-2 hover:underline focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:text-orange-400"
    >
      or choose a folder
    </button>
  )
}
