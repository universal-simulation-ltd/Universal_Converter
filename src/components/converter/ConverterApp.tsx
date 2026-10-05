import type { KeyboardEvent } from 'react'
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
      <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {/* No `overflow-x-auto` here. Setting one axis to `auto` computes the
            other to `auto` as well, and the tabs' `-mb-px` overflows this box
            by exactly 1px — which is enough for a permanent vertical scrollbar
            on platforms with classic (space-taking) scrollbars. The labels fit
            unaided at every width now that the hints drop out below `sm` and
            the row wraps, so nothing needs to scroll. */}
        {/* A real tablist: one Tab stop for the row, arrows (and Home/End)
            move between tabs, and the panel below names its tab. It had the
            tab ROLE without the rest, which tells a screen reader to expect
            arrow keys that then did nothing. */}
        <div
          role="tablist"
          aria-label="What to convert"
          onKeyDown={onTabKey}
          className={`${CONTAINER} flex flex-wrap items-center gap-1 pt-3`}
        >
          {/* ⚠️ Hints short enough that all five tabs sit on ONE row. The old
              ones ("MP3, M4A, Opus, FLAC, WAV & AIFF · on your device" …) were
              wider than the 1216px container, so Files wrapped onto a row of
              its own on every desktop — the first thing a newcomer saw was a
              tab bar that looked broken. "On your device" is not lost: every
              tab opens on a PrivacyNote, and the landing lead says it too. */}
          <TopTab id="all" current={tab} onClick={setTab} label="All" hint="Anything — sorted for you" />
          <TopTab id="audio" current={tab} onClick={setTab} label="Audio" hint="MP3, M4A, FLAC & more" />
          <TopTab id="image" current={tab} onClick={setTab} label="Images" hint="Convert & resize" />
          <TopTab id="video" current={tab} onClick={setTab} label="Video" hint="Trim, resize & compress" />
          <TopTab id="document" current={tab} onClick={setTab} label="Files" hint="Word & text → PDF" />
        </div>
      </div>

      <div role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)}>
        {tab === 'all' && <AllStudio />}
        {tab === 'audio' && <AudioStudio />}
        {tab === 'image' && <ImageStudio />}
        {tab === 'video' && <VideoStudio />}
        {tab === 'document' && <DocumentStudio />}
      </div>
    </div>
  )

  function onTabKey(e: KeyboardEvent<HTMLDivElement>) {
    const at = TAB_ORDER.indexOf(tab)
    const next =
      e.key === 'ArrowRight' ? TAB_ORDER[(at + 1) % TAB_ORDER.length]
      : e.key === 'ArrowLeft' ? TAB_ORDER[(at - 1 + TAB_ORDER.length) % TAB_ORDER.length]
      : e.key === 'Home' ? TAB_ORDER[0]
      : e.key === 'End' ? TAB_ORDER[TAB_ORDER.length - 1]
      : null
    if (!next) return
    e.preventDefault()
    setTab(next)
    document.getElementById(tabId(next))?.focus()
  }
}

const TAB_ORDER: TabId[] = ['all', 'audio', 'image', 'video', 'document']
const tabId = (id: TabId) => `converter-tab-${id}`
const panelId = (id: TabId) => `converter-panel-${id}`

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
      id={tabId(id)}
      aria-selected={active}
      aria-controls={active ? panelId(id) : undefined}
      tabIndex={active ? 0 : -1}
      onClick={() => onClick(id)}
      className={`group relative -mb-px flex flex-col items-start rounded-t-lg px-4 py-2.5 text-left transition-colors ${
        active ? 'border-b-2 border-orange-600' : 'border-b-2 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      <span className={`text-sm font-semibold ${active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-600 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-100'}`}>{label}</span>
      {/* Phones and tablets get the bare label — five fit across two rows at
          320px, where the hints would wrap into a three-line switcher, and
          below `lg` even the short hints do not fit five abreast. */}
      <span className="hidden text-[11px] text-slate-400 lg:block">{hint}</span>
    </button>
  )
}
