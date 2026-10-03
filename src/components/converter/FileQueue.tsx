import { useState } from 'react'
import { useFileDrop } from '@unisim/sdk'
import { LARGE_FILE_BYTES } from '../../lib/convert'
import { DROP_COPY } from '../../lib/formats'
import { formatBytes } from '../../lib/humanise'
import { useConverterStore } from '../../stores/converterStore'
import type { MediaKind, QueueItem } from '../../lib/types'

/**
 * A long queue shows its first few rows and a "View all" under them (James,
 * 2026-09-29: five albums dropped as folders made a page of hundreds of rows).
 * Only past `COLLAPSE_OVER`, so a short list never hides one or two rows behind
 * a button that would show barely more than it hides.
 */
const COLLAPSE_OVER = 10
const COLLAPSED_ROWS = 8

export default function FileQueue({ kind, targetExt }: { kind: MediaKind; targetExt: string }) {
  // Filter after selecting — see the note in StudioShell.
  const items = useConverterStore((s) => s.items).filter((i) => i.kind === kind)
  const running = useConverterStore((s) => s.running)
  const removeItem = useConverterStore((s) => s.removeItem)
  const downloadItem = useConverterStore((s) => s.downloadItem)
  const [expanded, setExpanded] = useState(false)

  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0)
  const doneCount = items.filter((i) => i.status === 'done').length
  // The store converts one file at a time, so there is at most one.
  const current = items.find((i) => i.status === 'converting')
  const collapsible = items.length > COLLAPSE_OVER
  const shown = collapsible && !expanded ? items.slice(0, COLLAPSED_ROWS) : items
  const failedCount = items.filter((i) => i.status === 'failed').length
  // What a screen reader hears: the file being worked on, then the outcome.
  // Per FILE, never per percent — the visible strip below carries a live
  // number, and reading that out was a counter nobody can follow.
  const announcement = current
    ? `Converting ${current.file.name}`
    : !running && doneCount + failedCount > 0
      ? `Finished: ${doneCount} ${doneCount === 1 ? 'file' : 'files'} ready` +
        (failedCount > 0 ? `, ${failedCount} couldn’t be converted` : '')
      : ''

  return (
    <div>
      {/* Mounted with the queue, before anything runs, so the first message
          is heard: a live region that appears WITH its text often is not. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <span className="text-[12.5px] font-bold text-slate-900 dark:text-slate-100">Files</span>
        <span className="ml-auto font-mono text-[11px] text-slate-400">
          {doneCount > 0
            ? `${doneCount} of ${items.length} converted`
            : `${items.length} queued · ${formatBytes(totalBytes)}`}
        </span>
      </div>

      {/* Which file the run is on. With the list collapsed the converting row
          is usually out of sight, and even expanded it can be a long scroll
          down — this says it without either. */}
      {current && (
        <div
          className="flex items-center gap-2 border-b border-slate-200 bg-orange-50/60 px-4 py-2.5 text-[12px] dark:border-slate-800 dark:bg-orange-950/20"
        >
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-orange-500" aria-hidden="true" />
          <span className="shrink-0 font-semibold text-slate-600 dark:text-slate-300">Currently converting:</span>
          <span className="min-w-0 truncate font-semibold text-slate-900 dark:text-slate-100" title={current.folder + current.file.name}>
            {current.file.name}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            {Math.round(current.progress * 100)}%
          </span>
        </div>
      )}

      <AddMore kind={kind} />

      <div className="grid grid-cols-[26px_minmax(0,1fr)_112px_72px_136px] gap-3 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 max-sm:hidden dark:bg-slate-800/60">
        <span />
        <span>File</span>
        <span>Convert</span>
        <span>Progress</span>
        <span />
      </div>

      <ul>
        {shown.map((item) => (
          <Row
            key={item.id}
            item={item}
            targetExt={targetExt}
            busy={running}
            onRemove={() => removeItem(item.id)}
            onDownload={() => downloadItem(item.id)}
          />
        ))}
      </ul>

      {collapsible && (
        <div className="border-t border-slate-200 px-4 py-2.5 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="w-full rounded-lg px-3 py-2 text-[12px] font-semibold text-orange-800 hover:bg-orange-50 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:text-orange-300 dark:hover:bg-orange-950/40"
          >
            {expanded ? 'Show fewer' : `View all ${items.length} files (${items.length - COLLAPSED_ROWS} more)`}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * "Add more files", at the top of the list of what you already have.
 *
 * ⚠️ This is the ONLY way to browse for files once a tab has a queue — owner
 * ask, 2026-08-31. The working ring in the right-hand column used to be
 * clickable as well, which put "add" in two places and put one of them beside
 * the Convert button, where a stray click opened a file picker over a batch
 * somebody was about to run. The ring still takes a DROP; it no longer takes a
 * click. See `StudioActions`.
 *
 * It deliberately spreads only `inputProps` and never `dropzoneProps`: this is
 * a button, not a second drop target. A dashed box here would be a third place
 * to aim, and the page-wide drop from `StudioActions` already catches a file
 * let go anywhere on this list. `useFileDrop` is still what drives it, for the
 * one bit of mechanics a hand-rolled input always gets wrong — resetting the
 * value, so picking the same file twice in a row fires a second `change`.
 */
function AddMore({ kind }: { kind: MediaKind }) {
  const addDropped = useConverterStore((s) => s.addDropped)
  const running = useConverterStore((s) => s.running)
  const copy = DROP_COPY[kind]

  const drop = useFileDrop({
    onFiles: (files) => void addDropped(files, kind),
    accept: copy.accept,
    clickToBrowse: false,
    folders: true,
  })

  return (
    <div className="border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
      <button
        type="button"
        disabled={running}
        onClick={drop.open}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-600 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:border-orange-700 dark:hover:bg-orange-950/40 dark:hover:text-orange-300"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add more files
      </button>
      <input {...drop.inputProps} className="hidden" />
    </div>
  )
}

function Row({
  item,
  targetExt,
  busy,
  onRemove,
  onDownload,
}: {
  item: QueueItem
  targetExt: string
  busy: boolean
  onRemove: () => void
  onDownload: () => void
}) {
  const skipped = item.status === 'unsupported'
  const failed = item.status === 'failed'
  const large = item.file.size > LARGE_FILE_BYTES && !skipped

  // Once a file is converted, the saving that matters is the one the user can
  // see: the new size, and how much smaller it got.
  const savedPct =
    item.result && item.file.size > 0
      ? Math.round((1 - item.result.blob.size / item.file.size) * 100)
      : null

  // Before it is converted, the size it is HEADING for — see lib/estimate.ts.
  // ⚠️ Only while there is no result: once the real number exists it replaces
  // the guess, rather than sitting beside it inviting a comparison of the
  // estimator against itself.
  const estimate = !item.result && !skipped && !failed ? item.estimate : null
  // The multiple is the whole reason this is here. "1.3 MB · ≈ 15.2 MB" already
  // says it if you read both numbers and divide; "12× bigger" says it if you
  // read neither. A 1 MB HEIC quietly becoming a 15 MB PNG is the case that
  // asked for this, so the growth is spelled out and the shrink is not — going
  // smaller is what a converter is expected to do.
  const growth = estimate != null && item.file.size > 0 ? estimate / item.file.size : null

  // The output size — expected, or real once it exists — gets a line of its own.
  //
  // ⚠️ It used to be the third of four values on the mono subtitle line, and on
  // a phone that line is 146px wide: "1.2 MB · 1600 × 1200 · ≈ 1.9 MB · 1.5×
  // bigger" wrapped across two or three lines of 10.5px slate-400 (2.55:1 on
  // white, under AA), breaking between a number and its unit — "≈ 2 / KB" is
  // what a HEIC row actually printed at 390px in WebKit. Nothing
  // was missing and nothing was truncated; it simply could not be read, which
  // is what "I can't see the export size on my phone" meant (James, 2026-08-30).
  // The answer to "how big will this be?" is the reason the estimator exists,
  // so it is not filler beside the source's own size any more.
  const outBytes = item.result ? item.result.blob.size : estimate

  return (
    <li
      className={`grid grid-cols-[26px_minmax(0,1fr)_112px_72px_136px] items-center gap-3 border-t border-slate-200 px-4 py-3 max-sm:grid-cols-[26px_minmax(0,1fr)_128px] dark:border-slate-800 ${
        skipped || failed ? 'bg-red-50/40 dark:bg-red-950/20' : ''
      } ${item.status === 'done' ? 'row-settle' : ''}`}
    >
      <span
        className={`flex h-6.5 w-6.5 items-center justify-center rounded-md text-[8.5px] font-extrabold ${
          skipped || failed ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        }`}
        aria-hidden="true"
      >
        {(item.ext || '?').slice(0, 4).toUpperCase()}
      </span>

      <span className="min-w-0">
        {/* Where it sat in a dropped folder — the place it goes back to in
            the ZIP. A line of its own, above the name: as a prefix on the
            name's line, `truncate` would clip the NAME to fit a deep path. */}
        {item.folder && (
          <span className="block truncate text-[10.5px] text-slate-500 dark:text-slate-400" title={item.folder}>
            {item.folder}
          </span>
        )}
        <span className="block truncate text-[12.5px] font-semibold text-slate-900 dark:text-slate-100">{item.file.name}</span>
        {/* What you brought. slate-500, not slate-400: at 10.5px on white the
            latter is 2.55:1, under AA's 4.5, and this is the size of type where
            that stops being a technicality. */}
        <span className={`block font-mono text-[10.5px] ${skipped || failed ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
          {item.error ??
            [
              formatBytes(item.file.size),
              item.detail,
              large ? 'large file — may run out of memory' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
        </span>

        {/* What you are getting. Its own line, at a size and a weight you can
            read at arm's length on a phone — see the note on `outBytes`. */}
        {outBytes != null && (
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] leading-tight">
            {/* The target format, phones only. Above `sm` the Convert column
                two tracks over already says `png → jpg`; below it, that column
                is hidden, so this is the only place the answer to "what am I
                getting?" appears at all. */}
            <span className="font-mono font-bold uppercase text-orange-700 sm:hidden dark:text-orange-400">
              → {targetExt}
            </span>
            {/* `whitespace-nowrap` is load-bearing, and it covers the WORD as
                well as the number: in a 146px column this line otherwise breaks
                between a number and its unit ("≈ 2" above "KB"), or leaves
                "expected" stranded on a line of its own under the figure it
                belongs to. Each piece here wraps whole or not at all. */}
            <span className="whitespace-nowrap">
              {/* Above `sm` the phone chip beside this is hidden, so a finished
                  row would print a bare "2.5 MB" directly under the source's
                  own "1.2 MB" — two numbers with nothing saying which is which.
                  The arrow is the app's existing word for "out". A queued row
                  needs no such help: "≈ … expected" already says it. */}
              {item.result && <span className="hidden font-bold text-orange-700 sm:inline dark:text-orange-400">→ </span>}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {item.result ? formatBytes(outBytes) : `≈ ${formatBytes(outBytes)}`}
              </span>
              {!item.result && <span className="text-slate-500 dark:text-slate-400"> expected</span>}
            </span>
            {growth != null && growth >= 1.5 && (
              // Amber, not red: a bigger file is a surprise worth flagging and
              // not a failure. The row converts perfectly well either way.
              <span className="whitespace-nowrap rounded border border-amber-200 bg-amber-50 px-1.5 py-px font-semibold text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
                {growth < 10 ? growth.toFixed(1) : Math.round(growth)}× bigger
              </span>
            )}
            {savedPct != null && savedPct > 0 && (
              <span className="whitespace-nowrap rounded border border-emerald-200 bg-emerald-50 px-1.5 py-px font-semibold text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
                {savedPct}% smaller
              </span>
            )}
          </span>
        )}

        {/* What the conversion had to give up. Amber and not red, because this
            row SUCCEEDED — the file beside it is good and downloadable — and
            painting it red would send somebody looking for a failure that did
            not happen. Full sentences, in the row, not behind a tooltip: the
            whole point is that it is read before the file is used. */}
        {item.notes.length > 0 && (
          <span className="mt-1 flex flex-col gap-1">
            {item.notes.map((note) => (
              <span
                key={note}
                className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10.5px] leading-snug text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
              >
                {note}
              </span>
            ))}
          </span>
        )}
      </span>

      <span className="font-mono text-[11px] text-slate-600 max-sm:hidden dark:text-slate-300">
        {skipped ? (
          <span className="text-slate-400">—</span>
        ) : (
          <>
            {item.ext} <span className="font-bold text-orange-700 dark:text-orange-400">→</span>{' '}
            <span className="font-bold text-slate-900 dark:text-slate-100">{targetExt}</span>
          </>
        )}
      </span>

      {/* The bar is only meaningful while there's progress left to show — once a
          row is done, skipped or failed the status word carries it, and the
          space goes to the Save button instead. */}
      <span className="max-sm:hidden">
        {(item.status === 'queued' || item.status === 'converting') && (
          <span
            role="progressbar"
            aria-label={`Converting ${item.file.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(item.progress * 100)}
            className="block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
          >
            <span
              className="block h-full rounded-full bg-gradient-to-r from-[#FE8C01] to-[#E05504] transition-[width] duration-200"
              style={{ width: `${Math.round(item.progress * 100)}%` }}
            />
          </span>
        )}
      </span>

      <span className="flex items-center justify-end gap-1.5">
        <Status item={item} />
        {item.status === 'done' && (
          <button
            type="button"
            onClick={onDownload}
            // Which file, by the name it will be SAVED as.
            aria-label={`Save ${item.result?.name ?? item.file.name}`}
            className="rounded-md bg-orange-500/12 px-2 py-1 text-[11px] font-bold text-orange-800 hover:bg-orange-500/20 dark:text-orange-300"
          >
            Save
          </button>
        )}
        {!busy && item.status !== 'converting' && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${item.file.name}`}
            className="rounded-md px-1.5 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </span>
    </li>
  )
}

// Status is carried by a semantic dot plus a word — never by the accent orange,
// so "done" and "failed" read at a glance without competing with the brand.
function Status({ item }: { item: QueueItem }) {
  const map = {
    queued: { dot: 'bg-slate-400', text: 'text-slate-500 dark:text-slate-400', label: 'Queued' },
    converting: { dot: 'bg-orange-500', text: 'text-slate-600 dark:text-slate-300', label: `${Math.round(item.progress * 100)}%` },
    done: { dot: 'bg-[#2F9E57]', text: 'text-slate-600 dark:text-slate-300', label: 'Done' },
    failed: { dot: 'bg-[#D5443A]', text: 'text-red-700 dark:text-red-400', label: 'Failed' },
    unsupported: { dot: 'bg-[#D5443A]', text: 'text-red-700 dark:text-red-400', label: 'Skipped' },
  }[item.status]

  return (
    <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${map.text}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${map.dot}`} aria-hidden="true" />
      {map.label}
    </span>
  )
}
