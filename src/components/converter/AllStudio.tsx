import { useState } from 'react'
import { CONTAINER } from '../../lib/layout'
import { ALL_ACCEPT } from '../../lib/formats'
import { useConverterStore } from '../../stores/converterStore'
import type { MediaKind } from '../../lib/types'
import DropZone from './DropZone'

/**
 * The All tab — the front door.
 *
 * The three studios each answer "convert this kind of thing", which is the
 * right question only once you have decided which kind of thing you have. This
 * tab asks nothing: drop whatever you have and it sorts them onto the tabs that
 * can do the work.
 *
 * ⚠️ It deliberately does NOT switch you to another tab on drop. A mixed drop
 * has no single right destination, and jumping somebody somewhere while files
 * are still landing is how you lose track of what you just dropped. It reports
 * what went where and lets you choose — and where the answer IS unambiguous
 * (everything landed on one tab), the button for that tab is the primary one.
 */
export default function AllStudio() {
  const addSorted = useConverterStore((s) => s.addSorted)
  const setTab = useConverterStore((s) => s.setTab)
  const items = useConverterStore((s) => s.items)
  const [last, setLast] = useState<{ audio: number; image: number; video: number; rejected: string[] } | null>(null)

  const waiting: Record<MediaKind, number> = {
    audio: items.filter((i) => i.kind === 'audio').length,
    image: items.filter((i) => i.kind === 'image').length,
    video: items.filter((i) => i.kind === 'video').length,
  }
  const total = waiting.audio + waiting.image + waiting.video
  const onlyTab = (['audio', 'image', 'video'] as const).filter((k) => waiting[k] > 0)

  return (
    <div className={`${CONTAINER} py-5 flex flex-col gap-4`}>
      <div className="rounded-xl border border-slate-200 bg-white">
        <DropZone
          variant={total === 0 ? 'empty' : 'more'}
          accept={ALL_ACCEPT}
          title="Drop anything here"
          formatsLine="Pictures, audio or video — it works out which is which and puts each one on the tab that can convert it."
          onFiles={(files) => setLast(addSorted(files))}
        />
      </div>

      {last && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            {last.audio + last.image + last.video === 0
              ? 'Nothing here could be converted'
              : 'Sorted — here is where everything went'}
          </h2>

          <div className="mt-3 flex flex-wrap gap-2">
            {(['image', 'audio', 'video'] as const).map((kind) =>
              waiting[kind] > 0 ? (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setTab(kind)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    onlyTab.length === 1 && onlyTab[0] === kind
                      ? 'border-orange-500 bg-orange-50 hover:bg-orange-100'
                      : 'border-slate-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-sm font-semibold text-slate-900">
                    {waiting[kind]} {LABEL[kind]}{waiting[kind] === 1 ? '' : 's'}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    Go to the {TAB_NAME[kind]} tab →
                  </span>
                </button>
              ) : null,
            )}
          </div>

          {last.rejected.length > 0 && (
            // Named individually rather than counted. "3 files skipped" makes
            // you go and work out which three; the whole point of a mixed drop
            // is that you were not looking closely in the first place.
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
              <span className="font-semibold">Not converted:</span> {last.rejected.join(', ')}.
              These are not a picture, a sound or a video this can read. MKV and AVI in
              particular need a different tool — see the notes on the Video tab.
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Everything happens on your device. Nothing is uploaded, and nothing leaves this tab —
        which is also why it can take a folder full of holiday photos without asking about a size
        limit.
      </p>
    </div>
  )
}

const LABEL: Record<MediaKind, string> = { audio: 'sound file', image: 'picture', video: 'video' }
const TAB_NAME: Record<MediaKind, string> = { audio: 'Audio', image: 'Images', video: 'Video' }
