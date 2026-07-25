import type { ReactNode } from 'react'
import { CONTAINER } from '../../lib/layout'
import DropZone from './DropZone'
import FileQueue from './FileQueue'
import PrivacyStrip from './PrivacyStrip'
import { useConverterStore } from '../../stores/converterStore'
import type { MediaKind } from '../../lib/types'

/**
 * The layout both studios share: privacy strip on top, queue on the left,
 * settings panel on the right. Audio and images differ only in what goes in that
 * right-hand panel and what the dropzone accepts — the frame is identical, which
 * is the point of one converter rather than two apps.
 */
export default function StudioShell({
  kind,
  accept,
  emptyTitle,
  moreTitle,
  formatsLine,
  engineBadge,
  targetExt,
  panel,
}: {
  kind: MediaKind
  accept: string
  emptyTitle: string
  moreTitle: string
  formatsLine: string
  engineBadge: string
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
      <PrivacyStrip kind={kind} engineBadge={engineBadge} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(288px,0.85fr)] gap-4 items-start">
        <div className="rounded-xl border border-slate-200 bg-white">
          {items.length === 0 ? (
            <div className="p-4">
              <DropZone
                onFiles={(files) => addFiles(files, kind)}
                variant="empty"
                accept={accept}
                title={emptyTitle}
                formatsLine={formatsLine}
              />
            </div>
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
