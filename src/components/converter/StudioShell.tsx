import { PrivacyNote } from '@unisim/sdk'
import type { ReactNode } from 'react'
import { CONTAINER } from '../../lib/layout'
import DropZone from './DropZone'
import FileQueue from './FileQueue'
import { useConverterStore } from '../../stores/converterStore'
import type { MediaKind } from '../../lib/types'

/**
 * The layout both studios share: privacy strip on top, queue on the left,
 * settings panel on the right. Audio and images differ only in what goes in that
 * right-hand panel and what the dropzone accepts — the frame is identical, which
 * is the point of one converter rather than two apps.
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
  accept,
  emptyTitle,
  moreTitle,
  formatsLine,
  targetExt,
  panel,
}: {
  kind: MediaKind
  accept: string
  emptyTitle: string
  moreTitle: string
  formatsLine: string
  targetExt: string
  panel: ReactNode
}) {
  // Select the whole array, then filter during render: a selector that returns
  // `items.filter(...)` builds a new array on every call, which fails zustand's
  // snapshot-identity check and spins React into an infinite re-render.
  const items = useConverterStore((s) => s.items).filter((i) => i.kind === kind)
  const addFiles = useConverterStore((s) => s.addFiles)

  return (
    <div className={`${CONTAINER} py-5 flex flex-col gap-4`}>
      <PrivacyNote
        repo="https://github.com/universal-simulation-ltd/Universal_Converter"
        proof="https://github.com/universal-simulation-ltd/Universal_Converter/blob/main/PRIVACY.md"
        subject={SUBJECT[kind]}
        plural
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(288px,0.85fr)] gap-4 items-start">
        <div className="rounded-xl border border-slate-200 bg-white">
          {items.length === 0 ? (
            // No padding wrapper: the empty state is the ring, and it centres
            // itself in the card the same way the All tab's does.
            <DropZone
              onFiles={(files) => addFiles(files, kind)}
              variant="empty"
              accept={accept}
              title={emptyTitle}
              formatsLine={formatsLine}
            />
          ) : (
            <>
              <FileQueue kind={kind} targetExt={targetExt} />
              <div className="p-4">
                <DropZone
                  onFiles={(files) => addFiles(files, kind)}
                  variant="more"
                  accept={accept}
                  title={moreTitle}
                  formatsLine={formatsLine}
                />
              </div>
            </>
          )}
        </div>

        {panel}
      </div>
    </div>
  )
}
