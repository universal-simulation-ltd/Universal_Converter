import { useState } from 'react'
import { DropAnywhere, DropRing, useFileDrop } from '@unisim/sdk'
import { CONTAINER } from '../../lib/layout'
import {
  ALL_ACCEPT, AUDIO_INPUT_EXTS, IMAGE_INPUT_EXTS, VIDEO_INPUT_EXTS,
} from '../../lib/formats'
import { useConverterStore } from '../../stores/converterStore'
import type { MediaKind } from '../../lib/types'

/**
 * The All tab — the front door.
 *
 * The three studios each answer "convert this kind of thing", which is the
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
 * ⚠️ It deliberately does NOT switch you to another tab on drop. A mixed drop
 * has no single destination, and jumping somebody somewhere while files are
 * still landing is how you lose track of what you just dropped. The right-hand
 * column reports what went where and offers the tabs; where the answer IS
 * unambiguous (everything landed on one tab) that tab's button is the primary.
 */
export default function AllStudio() {
  const addSorted = useConverterStore((s) => s.addSorted)
  const items = useConverterStore((s) => s.items)
  const [rejected, setRejected] = useState<string[]>([])

  // `pageWide`: the ring is where to aim, not where you have to land. A file
  // dropped on the header, the sorting column or the margin is sorted just the
  // same — and without it the browser navigates away to the file it was handed,
  // which throws away whatever was already queued.
  const drop = useFileDrop({
    onFiles: (files) => setRejected(addSorted(files).rejected),
    accept: ALL_ACCEPT,
    label: 'Drop any file here, or click to browse',
    pageWide: true,
  })

  const waiting: Record<MediaKind, number> = {
    image: items.filter((i) => i.kind === 'image').length,
    audio: items.filter((i) => i.kind === 'audio').length,
    video: items.filter((i) => i.kind === 'video').length,
  }
  const total = waiting.image + waiting.audio + waiting.video
  const tabsUsed = (['image', 'audio', 'video'] as const).filter((k) => waiting[k] > 0)

  return (
    <div className={`${CONTAINER} flex flex-col gap-4 py-5`}>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
        <div className="flex flex-col items-center gap-5 rounded-xl border border-slate-200 bg-white px-4 py-8 sm:px-8">
          <div
            {...drop.dropzoneProps}
            className="relative w-full max-w-[300px] cursor-pointer rounded-full transition-transform focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600"
            style={drop.over ? { transform: 'scale(1.02)' } : undefined}
          >
            {/* Never `busy`: nothing converts on this tab. The ring twinkles
                while it is waiting and goes still once it has something, which
                is the honest pair of states for a sorting office. */}
            <DropRing size="100%" over={drop.over} motion={total === 0 ? 'idle' : 'still'}>
              {total === 0 ? <EmptyCentre over={drop.over} /> : <SortedCentre waiting={waiting} total={total} />}
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
      <DropAnywhere show={drop.pageOver} hint="Pictures, audio and video — each finds its own tab" />
    </div>
  )
}

function EmptyCentre({ over }: { over: boolean }) {
  return (
    <>
      <svg
        viewBox="0 0 24 24"
        className={`mb-1 h-9 w-9 ${over ? 'text-orange-500' : 'text-slate-400'}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* One thing coming in, splitting two ways — sorting, not compressing.
            Universal Compress's mark is two arrows squeezing IN, and the two
            apps must not wear each other's glyph. Drawn with real arrowheads
            because at 36px a bare fork reads as a stray letter. */}
        <path d="M12 3v6" />
        <path d="M12 9c0 3-6 2-6 6" />
        <path d="M12 9c0 3 6 2 6 6" />
        <path d="M3.5 18 6 21l2.5-3" />
        <path d="M15.5 18 18 21l2.5-3" />
      </svg>
      <span className="text-[15px] font-bold text-slate-900">Drop any file here</span>
      <span className="text-[11.5px] leading-relaxed text-slate-500">
        Pictures · Audio · Video
      </span>
      <span className="mt-1 text-[11px] text-slate-400">or click to browse</span>
    </>
  )
}

function SortedCentre({ waiting, total }: { waiting: Record<MediaKind, number>; total: number }) {
  const tabs = (['image', 'audio', 'video'] as const).filter((k) => waiting[k] > 0).length
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
 * The column that adapts — the same idea as Universal Compress's options
 * column. Before anything is dropped it answers "will it take my file?"; after
 * a drop it answers "where did everything go?". An empty outline would be dead
 * space, and a list of formats you have already used is noise.
 */
function SortingColumn({
  waiting, tabsUsed, rejected,
}: {
  waiting: Record<MediaKind, number>
  tabsUsed: readonly MediaKind[]
  rejected: string[]
}) {
  const setTab = useConverterStore((s) => s.setTab)
  const total = waiting.image + waiting.audio + waiting.video

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <span className="text-[12.5px] font-bold text-slate-900">
            {total === 0 ? 'What this will take' : 'Where everything went'}
          </span>
        </div>

        <div className="flex flex-col gap-3 p-4">
          {total === 0 ? (
            <>
              <p className="text-[11.5px] leading-relaxed text-slate-500">
                Drop anything into the circle and it goes to the tab that can convert it. Drop a
                mixed pile and each file finds its own way.
              </p>
              <ul className="flex flex-col gap-2">
                <Capability label="Images" body={`${list(IMAGE_INPUT_EXTS)} — convert between PNG, JPEG, WebP and AVIF, and resize.`} />
                {/* ⚠️ MP4 is deliberately NOT listed here even though the audio
                    tab accepts it. `kindOf` sends an .mp4 to the VIDEO tab, so
                    listing it under Audio would promise a destination the
                    sorter does not use. Taking the sound out of a video is on
                    the video tab, under Other exports. */}
                <Capability label="Audio" body={`${list(AUDIO_INPUT_EXTS, ['mp4'])} — convert to MP3, M4A, Opus, FLAC, WAV or AIFF.`} />
                <Capability label="Video" body={`${list(VIDEO_INPUT_EXTS)} — trim, resize and compress to H.264 MP4.`} />
              </ul>
              {/* Named here rather than discovered on drop: MKV and AVI are the
                  two everybody tries, and finding out after you have dragged a
                  2 GB file across is the worst moment to be told. */}
              <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
                <span className="font-semibold text-slate-700">Not MKV or AVI.</span> Those
                containers need a different engine than the one that runs in a browser tab, so they
                are refused on drop rather than accepted and failed halfway through.
              </p>
            </>
          ) : (
            <>
              <p className="text-[11.5px] leading-relaxed text-slate-500">
                {tabsUsed.length === 1
                  ? 'Everything went to one tab — its settings are waiting there.'
                  : 'Each kind has its own settings, so pick a tab to carry on.'}
              </p>
              <div className="flex flex-col gap-2">
                {(['image', 'audio', 'video'] as const).map((kind) =>
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
            </>
          )}

          {rejected.length > 0 && (
            // Named individually rather than counted. "3 files skipped" makes
            // you go and work out which three, and the whole point of a mixed
            // drop is that you were not looking closely in the first place.
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
              <span className="font-semibold">Not converted:</span> {rejected.join(', ')} — not a
              picture, a sound or a video this can read.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Capability({ label, body }: { label: string; body: string }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-14 shrink-0 items-center justify-center rounded bg-slate-100 text-[9.5px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="text-[11.5px] leading-relaxed text-slate-600">{body}</span>
    </li>
  )
}

/**
 * Built from the real extension lists rather than typed out again, so the card
 * cannot drift from what the app actually accepts. `.qt` is dropped as a
 * synonym nobody types, and `.jpeg`/`.oga`/`.weba` likewise.
 */
function list(exts: readonly string[], also: readonly string[] = []): string {
  const skip = new Set(['jpeg', 'qt', 'oga', 'weba', ...also])
  return exts.filter((e) => !skip.has(e)).map((e) => e.toUpperCase()).join(', ')
}

const NOUN: Record<MediaKind, string> = { audio: 'sound file', image: 'picture', video: 'video' }
const TAB_NAME: Record<MediaKind, string> = { audio: 'Audio', image: 'Images', video: 'Video' }
