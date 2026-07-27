import { useConverterStore } from '../../stores/converterStore'
import { CONTAINER } from '../../lib/layout'
import AudioStudio from './AudioStudio'
import ImageStudio from './ImageStudio'
import VideoStudio from './VideoStudio'
import type { MediaKind } from '../../lib/types'

// Top-level shell: one switch above three studios, all sharing the same queue,
// settings-panel vocabulary and privacy story.
//  • Audio  — everything but OGG/Vorbis, which is the last ffmpeg-only target.
//  • Images — PNG / JPEG / WebP / AVIF, convert + resize, via the canvas encoder.
//  • Video  — H.264/MP4 via WebCodecs and our own demuxer and muxer.
export default function ConverterApp() {
  const tab = useConverterStore((s) => s.tab)
  const setTab = useConverterStore((s) => s.setTab)

  return (
    <div>
      <div className="border-b border-slate-200 bg-white">
        {/* No `overflow-x-auto` here. Setting one axis to `auto` computes the
            other to `auto` as well, and the tabs' `-mb-px` overflows this box
            by exactly 1px — which is enough for a permanent vertical scrollbar
            on platforms with classic (space-taking) scrollbars. The three
            labels fit unaided at every width now that the hints drop out below
            `sm`, so nothing needs to scroll. */}
        <div className={`${CONTAINER} flex items-center gap-1 pt-3`}>
          <TopTab id="audio" current={tab} onClick={setTab} label="Audio" hint="MP3, M4A, Opus, FLAC, WAV & AIFF · on your device" />
          <TopTab id="image" current={tab} onClick={setTab} label="Images" hint="Convert & resize · on your device" />
          <TopTab id="video" current={tab} onClick={setTab} label="Video" hint="Trim, resize & compress · on your device" />
        </div>
      </div>

      {tab === 'audio' && <AudioStudio />}
      {tab === 'image' && <ImageStudio />}
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
}: {
  id: MediaKind
  current: MediaKind
  onClick: (v: MediaKind) => void
  label: string
  hint: string
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
      <span className={`text-sm font-semibold ${active ? 'text-slate-900' : 'text-slate-600 group-hover:text-slate-900'}`}>{label}</span>
      {/* Phones get the bare label — three of them fit on one row at 320px,
          where the hints would wrap into a three-line switcher. */}
      <span className="hidden text-[11px] text-slate-400 sm:block">{hint}</span>
    </button>
  )
}
