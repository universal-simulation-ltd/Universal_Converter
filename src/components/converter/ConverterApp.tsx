import { useConverterStore } from '../../stores/converterStore'
import { CONTAINER } from '../../lib/layout'
import AllStudio from './AllStudio'
import AudioStudio from './AudioStudio'
import DocumentStudio from './DocumentStudio'
import ImageStudio from './ImageStudio'
import VideoStudio from './VideoStudio'
import type { TabId } from '../../stores/converterStore'

// Top-level shell: one switch above five studios, all sharing the same queue,
// settings-panel vocabulary and privacy story.
//  • All    — the front door. Takes anything and sorts it onto the tabs below;
//             it owns no queue of its own.

//  • Audio  — everything but OGG/Vorbis, which is the last ffmpeg-only target.
//  • Images — PNG / JPEG / WebP / AVIF, convert + resize, via the canvas encoder.
//  • Video  — H.264/MP4 via WebCodecs and our own demuxer and muxer.
//  • Files  — Word, OpenDocument, RTF, text, Markdown, HTML, CSV and JSON, out
//             to a laid-out PDF or to each other. Our own readers and our own
//             text-flow PDF writer; see `lib/doc`.
export default function ConverterApp() {
  const tab = useConverterStore((s) => s.tab)
  const setTab = useConverterStore((s) => s.setTab)

  return (
    <div>
      <div className="border-b border-slate-200 bg-white">
        {/* No `overflow-x-auto` here. Setting one axis to `auto` computes the
            other to `auto` as well, and the tabs' `-mb-px` overflows this box
            by exactly 1px — which is enough for a permanent vertical scrollbar
            on platforms with classic (space-taking) scrollbars. The labels fit
            unaided at every width now that the hints drop out below `sm` and
            the row wraps, so nothing needs to scroll. */}
        <div className={`${CONTAINER} flex flex-wrap items-center gap-1 pt-3`}>
          <TopTab id="all" current={tab} onClick={setTab} label="All" hint="Drop anything — it works out where it goes" />
          <TopTab id="audio" current={tab} onClick={setTab} label="Audio" hint="MP3, M4A, Opus, FLAC, WAV & AIFF · on your device" />
          <TopTab id="image" current={tab} onClick={setTab} label="Images" hint="Convert & resize · on your device" />
          <TopTab id="video" current={tab} onClick={setTab} label="Video" hint="Trim, resize & compress · on your device" />
          <TopTab id="document" current={tab} onClick={setTab} label="Files" hint="Word, text & data → PDF · on your device" />
        </div>
      </div>

      {tab === 'all' && <AllStudio />}
      {tab === 'audio' && <AudioStudio />}
      {tab === 'image' && <ImageStudio />}
      {tab === 'video' && <VideoStudio />}
      {tab === 'document' && <DocumentStudio />}
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
  id: TabId
  current: TabId
  onClick: (v: TabId) => void
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
      {/* Phones get the bare label — five fit across two rows at 320px,
          where the hints would wrap into a three-line switcher. */}
      <span className="hidden text-[11px] text-slate-400 sm:block">{hint}</span>
    </button>
  )
}
