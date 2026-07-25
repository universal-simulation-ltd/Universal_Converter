import { CONTAINER } from '../../lib/layout'
import { useConverterStore } from '../../stores/converterStore'

// Phase 2 — video. Deliberately a tab rather than a second app: video and audio
// share one ffmpeg.wasm core, one worker, one cache strategy and one licence
// decision (see next-products.md §10). This panel states what's coming and gets
// out of the way rather than shipping controls that do nothing.
export default function VideoStudio() {
  const setTab = useConverterStore((s) => s.setTab)

  return (
    <div className={`${CONTAINER} py-5`}>
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900">
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-orange-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
            <path d="M15.5 11l6-3.5v9l-6-3.5z" />
          </svg>
        </span>

        <h2 className="text-lg font-bold text-slate-900">Video conversion is the next phase</h2>
        <p className="mx-auto mt-2 max-w-md text-[13.5px] text-slate-600">
          Trim, compress, change container and pull the audio out of a video — all on this device,
          like the audio tab. It runs on the same engine, so it lands here rather than in a separate
          app.
        </p>

        <ul className="mx-auto mt-5 flex max-w-md flex-col gap-2 text-left text-[12.5px] text-slate-600">
          {[
            'MOV, MKV, AVI and WebM in — MP4 or WebM out',
            'Trim without re-encoding where the format allows: near instant',
            'Compress to a target size, or scale 4K down to 1080p',
            'Extract the audio straight into the audio tab',
          ].map((line) => (
            <li key={line} className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setTab('audio')}
          className="mt-6 rounded-xl border border-slate-200 px-4 py-2 text-[12.5px] font-semibold text-slate-700 transition-colors hover:border-orange-600 hover:text-orange-700"
        >
          Convert audio instead
        </button>
      </div>
    </div>
  )
}
