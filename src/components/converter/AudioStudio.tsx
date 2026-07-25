import { CONTAINER } from '../../lib/layout'
import DropZone from './DropZone'
import FileQueue from './FileQueue'
import OutputPanel from './OutputPanel'
import PrivacyStrip from './PrivacyStrip'
import { useConverterStore } from '../../stores/converterStore'

// Phase 1 — the audio studio. Queue on the left, one settings panel on the
// right, one primary action. Mirrors Universal QR's studio grid with the preview
// column swapped for the file queue.
export default function AudioStudio() {
  const items = useConverterStore((s) => s.items)
  const addFiles = useConverterStore((s) => s.addFiles)

  return (
    <div className={`${CONTAINER} py-5 flex flex-col gap-4`}>
      <PrivacyStrip />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(288px,0.85fr)] gap-4 items-start">
        <div className="rounded-xl border border-slate-200 bg-white">
          {items.length === 0 ? (
            <div className="p-4">
              <DropZone onFiles={addFiles} variant="empty" />
            </div>
          ) : (
            <>
              <FileQueue />
              <div className="p-4">
                <DropZone onFiles={addFiles} variant="more" />
              </div>
            </>
          )}
        </div>

        <OutputPanel />
      </div>
    </div>
  )
}
