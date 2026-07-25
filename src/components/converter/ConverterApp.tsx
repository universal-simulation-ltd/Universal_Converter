import { useConverterStore, type StudioTab } from '../../stores/converterStore'
import { CONTAINER } from '../../lib/layout'
import AudioStudio from './AudioStudio'
import VideoStudio from './VideoStudio'

// Top-level shell: an Audio | Video switch above the studios, plus a link out to
// Universal Images for the format work that app already does better than a
// generic converter would.
//  • Audio — Phase 1. Convert between the common audio formats on-device.
//  • Video — Phase 2. Trim / compress / extract audio on the same ffmpeg core.
export default function ConverterApp() {
  const tab = useConverterStore((s) => s.tab)
  const setTab = useConverterStore((s) => s.setTab)

  return (
    <div>
      <div className="border-b border-slate-200 bg-white">
        <div className={`${CONTAINER} flex items-center gap-1 pt-3 overflow-x-auto`}>
          <TopTab id="audio" current={tab} onClick={setTab} label="Audio" hint="Free · on your device" />
          <TopTab id="video" current={tab} onClick={setTab} label="Video" hint="Trim, compress, extract audio" soon />
          <a
            href="https://opensource.unisim.co.uk/images"
            className="group relative -mb-px flex flex-col items-start rounded-t-lg border-b-2 border-transparent px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
          >
            <span className="text-sm font-semibold text-slate-600 group-hover:text-slate-900">Images ↗</span>
            <span className="text-[11px] text-slate-400">Opens Universal Images</span>
          </a>
        </div>
      </div>

      {tab === 'audio' && <AudioStudio />}
      {tab === 'video' && <VideoStudio />}
    </div>
  )
}

function TopTab({
  id,
  current,
  onClick,
  label,
  hint,
  soon,
}: {
  id: StudioTab
  current: StudioTab
  onClick: (v: StudioTab) => void
  label: string
  hint: string
  soon?: boolean
}) {
  const active = current === id
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onClick(id)}
      className={`group relative -mb-px flex flex-col items-start rounded-t-lg px-4 py-2.5 text-left transition-colors ${
        active ? 'border-b-2 border-orange-600' : 'border-b-2 border-transparent hover:bg-slate-50'
      }`}
    >
      <span className="flex items-center gap-1.5">
        <span className={`text-sm font-semibold ${active ? 'text-slate-900' : 'text-slate-600 group-hover:text-slate-900'}`}>{label}</span>
        {soon && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
            Phase 2
          </span>
        )}
      </span>
      <span className="text-[11px] text-slate-400">{hint}</span>
    </button>
  )
}
