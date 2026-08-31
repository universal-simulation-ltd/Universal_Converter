import { DropAnywhere, DropRing, useFileDrop } from '@unisim/sdk'
import { DROP_COPY } from '../../lib/formats'
import { formatBytes } from '../../lib/humanise'
import { kindTotals, savingPercent, useConverterStore } from '../../stores/converterStore'
import type { MediaKind } from '../../lib/types'

/**
 * The bottom of a studio's right-hand column: ONE card, with the ring at the
 * top of it and the buttons underneath.
 *
 * ⚠️ **The ring lives INSIDE the action card** — owner ask, 2026-08-31. It was
 * a card of its own directly above this one, which drew a line across the two
 * halves of a single sentence: the ring counts what is queued and reports what
 * came out, and the button under it is what makes that happen. One card, and
 * the count sits on top of the button that changes it.
 *
 * ⚠️ **The ring no longer opens the file picker**, same ask. Adding files is
 * the LEFT column's job now — "Add more files" at the top of the queue, where
 * the list of what you have already got is — so this ring is a display that
 * still accepts a drop, not a button. `clickToBrowse: false` is what removes
 * the click, the keyboard handler and the `role="button"` together; leaving the
 * role on a thing that no longer opens anything is worse than plain text.
 *
 * It stays a DROP target, and page-wide at that, because the trap it closes is
 * real: a file dropped just outside a target is handed to the browser, which
 * navigates away from the page and takes a finished batch with it, unsaved.
 *
 * Nothing renders until the tab has a row. With an empty queue the tab's front
 * door is the big ring in the LEFT column (`StudioShell` → `DropZone`), and a
 * second circle beside it would be asking the same question twice.
 */
export default function StudioActions({ kind, canConvert }: { kind: MediaKind; canConvert: boolean }) {
  const items = useConverterStore((s) => s.items)
  if (!items.some((i) => i.kind === kind)) return null

  return <ActionCard kind={kind} canConvert={canConvert} />
}

/**
 * The same ring the tab opened on, still taking files, now reporting.
 *
 * `DropRing` comes from the SDK — the same component the All tab, the landing
 * page and Universal Compress use, not a copy — so the circle you dropped onto
 * and the circle you come back to are one object at four stages: queued,
 * running, finished, and always droppable.
 *
 * ⚠️ 240px, not 300: it shares a card with the buttons now, and at the old size
 * it pushed the primary action below the fold on a laptop. The ring's centre
 * has a fixed 40px inset either side whatever the diameter, so this is about as
 * small as it can go before "drop more, or press Convert" starts wrapping oddly.
 */
function StudioCircle({ kind }: { kind: MediaKind }) {
  const items = useConverterStore((s) => s.items)
  const running = useConverterStore((s) => s.running)
  const addDropped = useConverterStore((s) => s.addDropped)
  const copy = DROP_COPY[kind]

  const t = kindTotals(items, kind)

  // `pageWide`: the ring is where to aim, not where you have to land. Exactly
  // one of these is mounted at a time (one tab, and the empty state's ring
  // instead of this one), so exactly one owns the page.
  const drop = useFileDrop({
    onFiles: (files) => void addDropped(files, kind),
    accept: copy.accept,
    clickToBrowse: false,
    pageWide: true,
  })

  // While a run is going the ring tracks it; once everything has finished it
  // stays full, so a completed batch reads as complete rather than snapping
  // back to empty.
  const fill = running ? t.progress : t.done > 0 && t.pending === 0 ? 1 : t.progress

  return (
    <div className="flex w-full flex-col items-center">
      <div
        {...drop.dropzoneProps}
        className={`relative w-full max-w-[240px] rounded-full transition-transform ${
          drop.over ? 'scale-[1.02]' : ''
        }`}
      >
        {/* `still` while files are queued but nothing is running: neither the
            idle twinkle ("alive and waiting") nor the busy chase ("working") is
            true then, so the ring says nothing.

            ⚠️ `watermark={false}`, not omitted: from SDK 0.104 an omitted
            watermark draws the suite's GENERIC one, and a line drawing behind
            a count that changes several times a second is noise under the one
            thing being read. */}
        <DropRing
          size="100%"
          over={drop.over}
          motion={running ? 'busy' : 'still'}
          fill={fill}
          watermark={false}
        >
          <QueueCentre kind={kind} />
        </DropRing>
      </div>

      {/* From `pageOver`, not `over`: on the ring itself the ring answers. */}
      <DropAnywhere show={drop.pageOver} hint="Adds to the queue" />
    </div>
  )
}

function QueueCentre({ kind }: { kind: MediaKind }) {
  const items = useConverterStore((s) => s.items)
  const running = useConverterStore((s) => s.running)
  const t = kindTotals(items, kind)
  const finished = t.done > 0 && t.pending === 0 && !running

  if (running) {
    return (
      <>
        <span className="text-[30px] font-bold leading-none tabular-nums text-slate-900">
          {Math.round(t.progress * 100)}%
        </span>
        <span className="mt-1.5 text-[12px] font-semibold text-slate-600">Converting…</span>
        <span className="text-[11px] tabular-nums text-slate-400">
          {t.done} of {t.eligible} done
        </span>
      </>
    )
  }

  if (finished) {
    return (
      <>
        <span className="text-[30px] font-bold leading-none tabular-nums text-slate-900">{t.done}</span>
        <span className="mt-1.5 text-[12px] font-semibold text-slate-600">
          file{t.done === 1 ? '' : 's'} converted
        </span>
        {/* The before and after, not a percentage: a conversion that GREW the
            file is an ordinary outcome here — a JPEG asked for as a PNG is
            supposed to get bigger — and "−0%" would read as a failure. The two
            sizes say what happened without editorialising. */}
        <span className="text-[11px] tabular-nums text-slate-400">
          {formatBytes(t.bytesInDone)} → {formatBytes(t.bytesOutDone)}
        </span>
        <span className="mt-1.5 text-[10.5px] text-slate-400">drop more, or download below</span>
      </>
    )
  }

  return (
    <>
      <span className="text-[28px] font-bold leading-none tabular-nums text-slate-900">{t.eligible}</span>
      <span className="mt-1 text-[12px] font-semibold text-slate-600">
        file{t.eligible === 1 ? '' : 's'} ready
      </span>
      <span className="text-[11px] tabular-nums text-slate-400">{formatBytes(t.bytesIn)}</span>
      {/* The tail names the thing to do next, and there is no Convert button
          under the ring when nothing on the tab can be converted. */}
      <span className="mt-1.5 text-[10.5px] text-slate-400">
        {t.eligible === 0 ? 'drop more to get started' : 'drop more, or press Convert'}
      </span>
    </>
  )
}

/**
 * The ring and both actions, in one card.
 *
 * One card rather than three loose blocks because at most one thing is worth
 * doing next, and it should look like it: whatever that is takes the orange
 * button, and the other becomes a quiet second row. Two gradient buttons on top
 * of each other is the shape of a screen that cannot decide.
 *
 * ⚠️ **The new size leads.** "How big is it now?" is the question this card
 * exists to answer, and in Compress the answer used to be the smaller half of
 * an 11px grey mono fragment in a header (owner ask, 2026-08-29). It gets 26px
 * of its own here; what the file WAS, and what that saved, are the supporting
 * line under it, because they only mean anything relative to it.
 *
 * ⚠️ It renders even when NOTHING on the tab is convertible — it used to return
 * null, which was fine while the ring was a card of its own and is not now: the
 * ring is the tab's only remaining drop target, and unmounting it hands the
 * next dropped file to the browser, which navigates away from the queue.
 */
function ActionCard({ kind, canConvert }: { kind: MediaKind; canConvert: boolean }) {
  const items = useConverterStore((s) => s.items)
  const running = useConverterStore((s) => s.running)
  const convertAll = useConverterStore((s) => s.convertAll)
  const requeueAll = useConverterStore((s) => s.requeueAll)
  const downloadAll = useConverterStore((s) => s.downloadAll)

  const t = kindTotals(items, kind)
  // Every row on the tab is one this app can't open, so there is nothing to
  // act on — the ring stays, the buttons go.
  const nothingToDo = t.eligible === 0

  // ⚠️ `t.done === t.eligible`, NOT `t.pending === 0`. `pending` counts what is
  // QUEUED — the row being converted right now is in neither count — so halfway
  // through a two-file run `pending === 0 && done > 0` is true, and a card keyed
  // on it announces "Ready to download" over a run still going.
  const allDone = t.done === t.eligible && t.done > 0
  const saved = savingPercent(t.bytesInDone, t.bytesOutDone)

  const convertLabel = running
    ? 'Converting…'
    : allDone
      ? 'Convert again'
      : t.pending === 1
        ? 'Convert and save 1 file'
        : `Convert ${t.pending} files`

  // Did the one file save itself already? `convertAll` downloads a single
  // result the moment it is ready, so on that path the file is on disk before
  // this card is even read.
  const autoSaved =
    t.done === 1 && items.some((i) => i.kind === kind && i.result && i.savedAutomatically)

  // "and save" on the single-file button is not decoration: one file downloads
  // itself the moment it is done (see `convertAll`), and a button that starts a
  // download should say so before it is pressed.
  //
  // ⚠️ And once it HAS saved itself, this button stops offering to do the thing
  // that is already done. It used to read "Download the converted file" over a
  // file sitting in the downloads folder, so the obvious next press produced a
  // duplicate — same name, same bytes, two entries. The button still works and
  // is still there (re-saving after a browser "keep/discard" prompt is a real
  // thing to want); it just says which copy it is handing you.
  const downloadLabel =
    t.done === 1
      ? autoSaved
        ? 'Save another copy'
        : 'Download the converted file'
      : `Download all ${t.done} files as a ZIP`

  const primary =
    'w-full rounded-xl bg-gradient-to-br from-[#FE8C01] to-[#E05504] px-4 py-3 text-[14px] font-bold text-white shadow-sm transition-opacity hover:opacity-95 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-40'
  const secondary =
    'w-full rounded-xl bg-orange-500/12 px-4 py-2.5 text-[13px] font-bold text-orange-800 transition-colors hover:bg-orange-500/20 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div
      className={`rounded-xl border ${
        t.done > 0 ? 'border-orange-200 bg-orange-50/60' : 'border-slate-200 bg-white'
      }`}
    >
      {!nothingToDo && (
        <div
          className={`flex items-center gap-2.5 border-b px-4 py-3 ${
            t.done > 0 ? 'border-orange-200/70' : 'border-slate-200'
          }`}
        >
          {/* No count on the right any more: the ring directly below it is the
              count, and printing it twice in one card is the sort of thing that
              makes two numbers look like two different measurements. */}
          <span className="text-[12.5px] font-bold text-slate-900">
            {t.done === 0 ? 'Ready to convert' : allDone ? 'Ready to download' : `${t.done} ready so far`}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3 px-4 py-4">
        <StudioCircle kind={kind} />

        {nothingToDo ? (
          <p className="text-center text-[11px] leading-snug text-slate-500">
            Nothing in the list can be converted here — each row says why. Drop something else, or
            use <span className="font-semibold text-slate-700">Add more files</span> beside the
            list.
          </p>
        ) : (
          <>
            {t.done > 0 && (
              <div className="rounded-lg bg-white/70 px-3 py-2.5 ring-1 ring-orange-200/70">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-slate-500">
                    {allDone ? 'New size' : 'So far'}
                  </span>
                  {/* Green for smaller, amber for bigger, nothing for neither.
                      ⚠️ A converter is not a compressor: PNG out of a JPEG is
                      SUPPOSED to grow, so growth is flagged the way the queue
                      rows flag it — a surprise worth naming, not a failure. */}
                  {saved >= 1 && (
                    <span className="rounded-full bg-[#2F9E57]/12 px-2 py-0.5 text-[11px] font-bold text-[#166534]">
                      −{saved}%
                    </span>
                  )}
                  {saved <= -1 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                      +{-saved}%
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[26px] font-bold leading-none tabular-nums text-slate-900">
                  {formatBytes(t.bytesOutDone)}
                </div>
                <div className="mt-1.5 text-[11px] leading-snug text-slate-500">
                  {saved >= 1 || saved <= -1 ? (
                    <>
                      was{' '}
                      <span className="tabular-nums line-through decoration-slate-400">
                        {formatBytes(t.bytesInDone)}
                      </span>
                    </>
                  ) : (
                    'about the same size as before'
                  )}
                </div>
              </div>
            )}

            {/* Whichever is the thing to do next gets the orange. Once anything
                has finished that is the download — the converting is behind
                you, and the file is the reason you came. */}
            {t.done > 0 ? (
              <>
                {/* Once the file is saved, NOTHING in this card is orange, and
                    that is deliberate. A primary button is a claim that there
                    is a next step; here there is not one — the job finished and
                    the file is on disk. Promoting "Convert again" to fill the
                    gap would invite a pointless re-run, and leaving "Save
                    another copy" orange is how the duplicate got pressed in the
                    first place. */}
                {autoSaved && (
                  <p className="text-center text-[11.5px] font-semibold text-[#166534]">
                    Saved to your downloads.
                  </p>
                )}
                <button
                  type="button"
                  disabled={running}
                  onClick={() => void downloadAll(kind)}
                  className={autoSaved ? secondary : primary}
                >
                  {downloadLabel}
                </button>
                <button
                  type="button"
                  disabled={running || (!allDone && (!canConvert || t.pending === 0))}
                  onClick={() => (allDone ? requeueAll(kind) : void convertAll(kind))}
                  className={secondary}
                >
                  {convertLabel}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={running || !canConvert || t.pending === 0}
                onClick={() => void convertAll(kind)}
                className={primary}
              >
                {convertLabel}
              </button>
            )}

            <p className="text-center text-[10.5px] text-slate-500">
              Converted files are saved straight to your downloads. Nothing is uploaded.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
