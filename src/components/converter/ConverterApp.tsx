import type { KeyboardEvent, RefObject } from 'react'
import { isDefaultTabOrder, useDefaultView, useTabReorder, type TabReorder, type UseDefaultView } from '@unisim/sdk'
import { PHONE } from '../../native/shell'
import { useTabOrder } from '../../native/tabOrder'
import { TABS, useConverterStore } from '../../stores/converterStore'
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
  // Double-tap a tab to open the app on it (James, 2026-09-30). The store read
  // the same default at start-up; this is the tap that sets it and the orange
  // mark that shows which one it is. Tune this app has the same choice.
  const dv = useDefaultView<TabId>('tab', 'all', { views: TABS })
  // The phone app's tabs reorder: hold one and drag it along the bar
  // (BRANDING.md ▸ "Tabs reorder: hold and drag"; SDK phone kit 0.230). No bin:
  // every tab is always there. The website keeps the fixed order.
  const stored = useTabOrder((s) => s.order)
  const setOrder = useTabOrder((s) => s.setOrder)
  const order = PHONE ? stored : TAB_ORDER
  const reorder = useTabReorder<TabId>({
    tabs: order,
    onReorder: (next) => setOrder(isDefaultTabOrder(next, TABS) ? null : next),
    enabled: PHONE,
  })
  const shownOrder = PHONE ? reorder.order : TAB_ORDER

  return (
    <div>
      {/* On a phone the tray docks at the foot of the screen (owner rule
          2026-11-19, BRANDING.md → "On a phone, navigation sits at the
          bottom"; SDK 0.222 `u-tabs--dock`), so this strip has nothing left
          in it there: no border, no padding. From 768px up it is unchanged. */}
      <div className="border-slate-200 md:border-b md:bg-white dark:border-slate-800 md:dark:bg-slate-900">
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
          className={`${CONTAINER} md:py-3`}
        >
          <div className="u-tabs u-tabs--dock" ref={PHONE ? (reorder.barRef as RefObject<HTMLDivElement>) : undefined}>
          {/* The hints: see TAB_COPY. */}
          {shownOrder.map((id) => (
            <TopTab key={id} id={id} current={tab} onClick={setTab} dv={dv} label={TAB_COPY[id].label} hint={TAB_COPY[id].hint} reorder={PHONE ? reorder : null} />
          ))}
          </div>
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
    // The arrows follow the bar as drawn (the phone's own order).
    const at = order.indexOf(tab)
    const next =
      e.key === 'ArrowRight' ? order[(at + 1) % order.length]
      : e.key === 'ArrowLeft' ? order[(at - 1 + order.length) % order.length]
      : e.key === 'Home' ? order[0]
      : e.key === 'End' ? order[order.length - 1]
      : null
    if (!next) return
    e.preventDefault()
    setTab(next)
    document.getElementById(tabId(next))?.focus()
  }
}

const TAB_ORDER: TabId[] = ['all', 'audio', 'image', 'video', 'document']

// ⚠️ Hints short enough that all five tabs sit on ONE row. The old ones ("MP3,
// M4A, Opus, FLAC, WAV & AIFF · on your device" …) were wider than the 1216px
// container, so Files wrapped onto a row of its own on every desktop — the
// first thing a newcomer saw was a tab bar that looked broken. "On your
// device" is not lost: every tab opens on a PrivacyNote, and the landing lead
// says it too.
const TAB_COPY: Record<TabId, { label: string; hint: string }> = {
  all: { label: 'All', hint: 'Anything — sorted for you' },
  audio: { label: 'Audio', hint: 'MP3, M4A, FLAC & more' },
  image: { label: 'Images', hint: 'Convert & resize' },
  video: { label: 'Video', hint: 'Trim, resize & compress' },
  document: { label: 'Files', hint: 'Word & text → PDF' },
}
const tabId = (id: TabId) => `converter-tab-${id}`
const panelId = (id: TabId) => `converter-panel-${id}`

function TopTab({
  id,
  current,
  onClick,
  label,
  hint,
  dv,
  reorder,
}: {
  id: TabId
  current: TabId
  onClick: (v: TabId) => void
  label: string
  hint: string
  dv: UseDefaultView<TabId>
  /** The phone's hold and drag; null on the website. */
  reorder: TabReorder<TabId> | null
}) {
  const active = current === id
  const dvProps = dv.buttonProps(id, label)
  return (
    <button
      type="button"
      role="tab"
      id={tabId(id)}
      aria-selected={active}
      aria-controls={active ? panelId(id) : undefined}
      tabIndex={active ? 0 : -1}
      {...dvProps}
      {...(reorder ? reorder.tabProps(id) : {})}
      onClick={() => { dv.tap(id); onClick(id) }}
      // The suite's tray tabs (SDK 0.216, BRANDING.md → Tabs): aria-selected
      // selects, and buttonProps' data-default-view draws the opens-here dot.
      className="u-tab px-3 sm:px-4"
    >
      <span className="flex flex-col items-start gap-1 text-left">
        <span>{label}</span>
        {/* Phones and tablets get the bare label — below `lg` even the short
            hints do not fit five abreast. */}
        <span className="hidden text-[11px] font-medium text-slate-400 lg:block">{hint}</span>
      </span>
    </button>
  )
}
