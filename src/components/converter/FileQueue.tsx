import { LARGE_FILE_BYTES } from '../../lib/convert'
import { formatBytes } from '../../lib/humanise'
import { useConverterStore } from '../../stores/converterStore'
import type { MediaKind, QueueItem } from '../../lib/types'

export default function FileQueue({ kind, targetExt }: { kind: MediaKind; targetExt: string }) {
  // Filter after selecting — see the note in StudioShell.
  const items = useConverterStore((s) => s.items).filter((i) => i.kind === kind)
  const running = useConverterStore((s) => s.running)
  const removeItem = useConverterStore((s) => s.removeItem)
  const downloadItem = useConverterStore((s) => s.downloadItem)

  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0)
  const doneCount = items.filter((i) => i.status === 'done').length

  return (
    <div>
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-3">
        <span className="text-[12.5px] font-bold text-slate-900">Files</span>
        <span className="ml-auto font-mono text-[11px] text-slate-400">
          {doneCount > 0
            ? `${doneCount} of ${items.length} converted`
            : `${items.length} queued · ${formatBytes(totalBytes)}`}
        </span>
      </div>

      <div className="grid grid-cols-[26px_minmax(0,1fr)_112px_72px_136px] gap-3 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 max-sm:hidden">
        <span />
        <span>File</span>
        <span>Convert</span>
        <span>Progress</span>
        <span />
      </div>

      <ul>
        {items.map((item) => (
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

  return (
    <li
      className={`grid grid-cols-[26px_minmax(0,1fr)_112px_72px_136px] items-center gap-3 border-t border-slate-200 px-4 py-3 max-sm:grid-cols-[26px_minmax(0,1fr)_128px] ${
        skipped || failed ? 'bg-red-50/40' : ''
      } ${item.status === 'done' ? 'row-settle' : ''}`}
    >
      <span
        className={`flex h-6.5 w-6.5 items-center justify-center rounded-md text-[8.5px] font-extrabold ${
          skipped || failed ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
        }`}
        aria-hidden="true"
      >
        {(item.ext || '?').slice(0, 4).toUpperCase()}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-semibold text-slate-900">{item.file.name}</span>
        <span className={`block font-mono text-[10.5px] ${skipped || failed ? 'text-red-700' : 'text-slate-400'}`}>
          {item.error ??
            [
              formatBytes(item.file.size),
              item.detail,
              item.result ? `→ ${formatBytes(item.result.blob.size)}` : null,
              savedPct != null && savedPct > 0 ? `${savedPct}% smaller` : null,
              large ? 'large file — may run out of memory' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
        </span>

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
                className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10.5px] leading-snug text-amber-900"
              >
                {note}
              </span>
            ))}
          </span>
        )}
      </span>

      <span className="font-mono text-[11px] text-slate-600 max-sm:hidden">
        {skipped ? (
          <span className="text-slate-400">—</span>
        ) : (
          <>
            {item.ext} <span className="font-bold text-orange-700">→</span>{' '}
            <span className="font-bold text-slate-900">{targetExt}</span>
          </>
        )}
      </span>

      {/* The bar is only meaningful while there's progress left to show — once a
          row is done, skipped or failed the status word carries it, and the
          space goes to the Save button instead. */}
      <span className="max-sm:hidden">
        {(item.status === 'queued' || item.status === 'converting') && (
          <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100">
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
            className="rounded-md bg-orange-500/12 px-2 py-1 text-[11px] font-bold text-orange-800 hover:bg-orange-500/20"
          >
            Save
          </button>
        )}
        {!busy && item.status !== 'converting' && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${item.file.name}`}
            className="rounded-md px-1.5 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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
    queued: { dot: 'bg-slate-400', text: 'text-slate-500', label: 'Queued' },
    converting: { dot: 'bg-orange-500', text: 'text-slate-600', label: `${Math.round(item.progress * 100)}%` },
    done: { dot: 'bg-[#2F9E57]', text: 'text-slate-600', label: 'Done' },
    failed: { dot: 'bg-[#D5443A]', text: 'text-red-700', label: 'Failed' },
    unsupported: { dot: 'bg-[#D5443A]', text: 'text-red-700', label: 'Skipped' },
  }[item.status]

  return (
    <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${map.text}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${map.dot}`} aria-hidden="true" />
      {map.label}
    </span>
  )
}
