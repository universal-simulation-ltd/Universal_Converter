import { PrivacyNote } from '@unisim/sdk'
import type { ReactNode } from 'react'
import { CONTAINER } from '../../lib/layout'
import { DROP_COPY } from '../../lib/formats'
import DropZone from './DropZone'
import FileQueue from './FileQueue'
import { useConverterStore } from '../../stores/converterStore'
import type { MediaKind } from '../../lib/types'

/**
 * The layout all four studios share: privacy note on top, queue on the left,
 * settings and every action on the right. The tabs differ only in what goes in
 * that right-hand column and what the drop targets accept — the frame is
 * identical, which is the point of one converter rather than four apps.
 *
 * ⚠️ **The left column answers "what have I got"; the right one is everything
 * that happens** — Universal Compress's shape, brought across on 2026-08-30.
 * The queue used to end in a compact dashed "drop more" strip; that strip is
 * gone, and the drop target is the circle INSIDE the action card in the
 * right-hand column, directly above the Convert and Download buttons (see
 * `StudioActions`, which each studio's panel column ends with).
 *
 * ⚠️ Since 2026-08-31 that circle takes a drop but no longer takes a CLICK:
 * browsing for more files is "Add more files" at the top of the queue on the
 * left (`FileQueue` → `AddMore`), beside the list of what you already have.
 *
 * The columns also change weight once something is queued: an empty tab is
 * mostly the ring it opens on, and a working one needs the extra width on the
 * right for the ring and the buttons that share its card.
 */
// Name the thing in front of the reader, per tab. A generic "your files" would
// work grammatically and say less — and "your documents" in particular is the
// specific reassurance, because a document is the thing most likely to be under
// an NDA or a duty of care. Inherited from the strip this replaced.
const SUBJECT: Record<MediaKind, string> = {
  audio: 'Your audio files',
  image: 'Your images',
  video: 'Your videos',
  document: 'Your documents',
}

export default function StudioShell({
  kind,
  targetExt,
  panel,
}: {
  kind: MediaKind
  targetExt: string
  panel: ReactNode
}) {
  // Select the whole array, then filter during render: a selector that returns
  // `items.filter(...)` builds a new array on every call, which fails zustand's
  // snapshot-identity check and spins React into an infinite re-render.
  const items = useConverterStore((s) => s.items).filter((i) => i.kind === kind)
  const addDropped = useConverterStore((s) => s.addDropped)
  const copy = DROP_COPY[kind]
  const empty = items.length === 0

  return (
    <div className={`${CONTAINER} py-5 flex flex-col gap-4`}>
      <PrivacyNote
        repo="https://github.com/universal-simulation-ltd/Universal_Converter"
        proof="https://github.com/universal-simulation-ltd/Universal_Converter/blob/main/PRIVACY.md"
        subject={SUBJECT[kind]}
        plural
      />

      <div
        className={`grid grid-cols-1 items-start gap-4 ${
          empty
            ? 'lg:grid-cols-[minmax(0,1.55fr)_minmax(288px,0.85fr)]'
            : 'lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.95fr)]'
        }`}
      >
        <div className="rounded-xl border border-slate-200 bg-white">
          {empty ? (
            // No padding wrapper: the empty state is the ring, and it centres
            // itself in the card the same way the All tab's does.
            <DropZone
              onFiles={(files) => addDropped(files, kind)}
              accept={copy.accept}
              title={copy.emptyTitle}
              formatsLine={copy.formatsLine}
            />
          ) : (
            <FileQueue kind={kind} targetExt={targetExt} />
          )}
        </div>

        {panel}
      </div>
    </div>
  )
}
