import { useState } from 'react'
import { DropAnywhere, DropRing, useFileDrop } from '@unisim/sdk'
import { CONTAINER } from '../../lib/layout'
import { ALL_ACCEPT } from '../../lib/formats'
import { KINDS, useConverterStore } from '../../stores/converterStore'
import type { MediaKind } from '../../lib/types'
import { AnyFileWatermark } from './DropWatermarks'
import LandingPage from '../Landing/LandingPage'

/**
 * The All tab — the front door.
 *
 * The four studios each answer "convert this kind of thing", which is the
 * right question only once you have decided which kind of thing you have. This
 * tab asks nothing: drop whatever you have and it sorts each file onto the tab
 * that can do the work.
 *
 * The circle and the two-column shape are Universal Compress's, on purpose.
 * Both apps open on "drop anything and we will work out what it is", and two
 * front doors to the same idea that look different make the suite feel like a
 * collection of unrelated tools. The ring itself is literally the same
 * component — `DropRing` in `@unisim/sdk` — rather than a copy, so a change to
 * it lands in both.
 *
 * ⚠️ A MIXED drop deliberately does NOT switch you anywhere. It has no single
 * destination, and jumping somebody somewhere while files are still landing is
 * how you lose track of what you just dropped. The right-hand column reports
 * what went where and offers the tabs.
 *
 * A drop that is entirely ONE kind is the opposite case and does switch, since
 * 2026-08-30 — there is exactly one destination, so this screen would only be
 * asking a question it already knows the answer to. The rule (including the
 * cases where it must NOT fire) is `tabAfterDrop` in `lib/routing`, and the
 * store's `addDropped` is what applies it; this tab just hands it the files.
 *
 * WITH NOTHING QUEUED IT IS THE LANDING PAGE — illustration on the left,
 * headline and drop circle on the right, the same shape Universal PDF and
 * Universal Images open on. This layout stays as the WORKING screen, which is
 * what it was always right for; what it was wrong for was being a first
 * impression, where half the page was a card listing every accepted extension
 * to somebody who had not yet found the circle. The sorter, the counts and the
 * rejection list stay here and are handed down, so a file dropped on the
 * landing page goes through exactly the same code path as one dropped here.
 */
export default function AllStudio() {
  const addDropped = useConverterStore((s) => s.addDropped)
  const items = useConverterStore((s) => s.items)
  const [rejected, setRejected] = useState<string[]>([])

  // `pageWide`: the ring is where to aim, not where you have to land. A file
  // dropped on the header, the sorting column or the margin is sorted just the
  // same — and without it the browser navigates away to the file it was handed,
  // which throws away whatever was already queued.
  const drop = useFileDrop({
    onFiles: (files) => setRejected(addDropped(files, 'all').rejected),
    accept: ALL_ACCEPT,
    label: 'Drop any file here, or click to browse',
    pageWide: true,
  })

  const waiting = Object.fromEntries(
    KINDS.map((kind) => [kind, items.filter((i) => i.kind === kind).length]),
  ) as Record<MediaKind, number>
  const total = KINDS.reduce((sum, kind) => sum + waiting[kind], 0)
  const tabsUsed = KINDS.filter((k) => waiting[k] > 0)

  // `rejected` is deliberately still ours: a drop where NOTHING is convertible
  // leaves `total` at 0, so the landing page is what has to report it, and a
  // drop where only some files are turned away lands on the layout below. One
  // piece of state, read by whichever screen is up.
  if (total === 0) {
    return <LandingPage onFiles={(files) => setRejected(addDropped(files, 'all').rejected)} rejected={rejected} />
  }

  return (
    <div className={`${CONTAINER} flex flex-col gap-4 py-5`}>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
        <div className="flex flex-col items-center gap-5 rounded-xl border border-slate-200 bg-white px-4 py-8 sm:px-8">
          <div
            {...drop.dropzoneProps}
            className="relative w-full max-w-[300px] cursor-pointer rounded-full transition-transform focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600"
            style={drop.over ? { transform: 'scale(1.02)' } : undefined}
          >
            {/* Always `still`, and never `busy`: nothing converts on this tab,
                and the twinkling `idle` ring belongs to the landing page this
                screen replaces the moment anything is queued — by the time you
                are here the circle has something, so "alive and waiting" is no
                longer the true sentence. */}
            <DropRing size="100%" over={drop.over} motion="still" watermark={<AnyFileWatermark />}>
              <SortedCentre waiting={waiting} total={total} />
            </DropRing>
          </div>
          <input {...drop.inputProps} className="hidden" />

          <p className="max-w-sm text-center text-[11.5px] leading-relaxed text-slate-500">
            Everything happens on your device. Nothing is uploaded, so there is no size limit and
            no queue to wait in.
          </p>
        </div>

        <SortingColumn waiting={waiting} tabsUsed={tabsUsed} rejected={rejected} />
      </div>

      {/* Drawn from `pageOver`, not `over`: over the ring itself the ring is
          already saying it. */}
      <DropAnywhere show={drop.pageOver} hint="Pictures, audio, video and documents — each finds its own tab" />
    </div>
  )
}

function SortedCentre({ waiting, total }: { waiting: Record<MediaKind, number>; total: number }) {
  const tabs = KINDS.filter((k) => waiting[k] > 0).length
  return (
    <>
      <span className="text-[34px] font-bold leading-none tabular-nums text-slate-900">{total}</span>
      <span className="mt-1.5 text-[12px] font-semibold text-slate-600">
        file{total === 1 ? '' : 's'} sorted
      </span>
      <span className="text-[11px] tabular-nums text-slate-400">
        onto {tabs} tab{tabs === 1 ? '' : 's'}
      </span>
      <span className="mt-1.5 text-[10.5px] text-slate-400">drop more, or pick a tab</span>
    </>
  )
}

/**
 * The column that says where everything went.
 *
 * It used to have a second half — "what this will take", a list of every
 * accepted extension — for the case where nothing had been dropped yet. That
 * half was a first-visit answer shown only on the screen you reach by having
 * already dropped something, so it moved to the landing page (see
 * `../Landing/LandingPage.tsx`) and this column is now one job: after a drop,
 * where did each file go. A list of formats you have already used is noise.
 */
function SortingColumn({
  waiting, tabsUsed, rejected,
}: {
  waiting: Record<MediaKind, number>
  tabsUsed: readonly MediaKind[]
  rejected: string[]
}) {
  const setTab = useConverterStore((s) => s.setTab)

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <span className="text-[12.5px] font-bold text-slate-900">Where everything went</span>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <p className="text-[11.5px] leading-relaxed text-slate-500">
            {tabsUsed.length === 1
              ? 'Everything went to one tab — its settings are waiting there.'
              : 'Each kind has its own settings, so pick a tab to carry on.'}
          </p>
          <div className="flex flex-col gap-2">
            {KINDS.map((kind) =>
              waiting[kind] > 0 ? (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setTab(kind)}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                    tabsUsed.length === 1
                      ? 'border-orange-500 bg-orange-50 hover:bg-orange-100'
                      : 'border-slate-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  <span>
                    <span className="block text-[12.5px] font-bold text-slate-900">
                      {waiting[kind]} {NOUN[kind]}{waiting[kind] === 1 ? '' : 's'}
                    </span>
                    <span className="block text-[11px] text-slate-500">{TAB_NAME[kind]} tab</span>
                  </span>
                  <span aria-hidden className="text-slate-400">→</span>
                </button>
              ) : null,
            )}
          </div>

          {rejected.length > 0 && (
            // Named individually rather than counted. "3 files skipped" makes
            // you go and work out which three, and the whole point of a mixed
            // drop is that you were not looking closely in the first place.
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
              <span className="font-semibold">Not converted:</span> {rejected.join(', ')} — not a
              picture, a sound, a video or a document this can read.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const NOUN: Record<MediaKind, string> = {
  audio: 'sound file', image: 'picture', video: 'video', document: 'document',
}
const TAB_NAME: Record<MediaKind, string> = {
  audio: 'Audio', image: 'Images', video: 'Video', document: 'Files',
}
