import { useState, type ReactNode } from 'react'
import { useConverterStore } from '../../stores/converterStore'
import type { MediaKind } from '../../lib/types'

// The settings-panel vocabulary, shared by the audio and image studios so the
// two tabs are the same instrument with different strings.

export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-3">
        <span className="text-[12.5px] font-bold text-slate-900">Output</span>
        <span className="ml-auto font-mono text-[11px] text-slate-400">applies to all</span>
      </div>
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-slate-600">{label}</span>
      {children}
    </div>
  )
}

export function Divider() {
  return <div className="h-px bg-slate-200" />
}

// A disclosure for settings most people never touch. `summary` keeps the panel
// honest while it's shut: whatever is folded away is still readable at a glance,
// so a stray trim or a mono downmix can't apply invisibly.
export function Collapsible({
  label,
  summary,
  defaultOpen = false,
  children,
}: {
  label: string
  summary?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left focus:outline-none focus-visible:outline-2 focus-visible:outline-orange-600"
      >
        <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-slate-600">{label}</span>
        {!open && summary && (
          <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-400">{summary}</span>
        )}
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className={`ml-auto h-3 w-3 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="flex flex-col gap-4">{children}</div>}
    </div>
  )
}

export function FormatChip({
  label,
  selected,
  ready,
  disabled,
  title,
  onSelect,
}: {
  label: string
  selected: boolean
  ready: boolean
  disabled: boolean
  title?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      title={title}
      className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-orange-600 disabled:opacity-50 ${
        selected
          ? 'bg-gradient-to-br from-[#FE8C01] to-[#E05504] font-bold text-white'
          : ready
            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            : 'bg-slate-100 text-slate-400'
      }`}
    >
      {label}
      {!ready && <span className="ml-1 align-middle text-[9px]">•</span>}
    </button>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  disabled,
  onChange,
  unavailable,
  unavailableTitle,
}: {
  options: { value: T; label: string }[]
  value: T
  disabled: boolean
  onChange: (value: T) => void
  /** Options the current encoder will refuse — struck through, not hidden. */
  unavailable?: T[]
  unavailableTitle?: string
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-200">
      {options.map((o) => {
        const off = unavailable?.includes(o.value) ?? false
        return (
          <button
            key={String(o.value)}
            type="button"
            disabled={disabled || off}
            title={off ? unavailableTitle : undefined}
            onClick={() => onChange(o.value)}
            className={`flex-1 py-1.5 text-[11.5px] font-semibold transition-colors disabled:opacity-50 ${
              value === o.value
                ? 'bg-slate-900 text-white'
                : off
                  ? 'text-slate-400 line-through'
                  : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Select<T extends string | number>({
  options,
  value,
  disabled,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  disabled: boolean
  onChange: (value: T) => void
}) {
  return (
    <select
      value={String(value)}
      disabled={disabled}
      onChange={(e) => {
        const picked = options.find((o) => String(o.value) === e.target.value)
        if (picked) onChange(picked.value)
      }}
      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-900 tabular-nums focus:outline-none focus-visible:outline-2 focus-visible:outline-orange-600 disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Toggle({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  on: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 text-left focus:outline-none focus-visible:outline-2 focus-visible:outline-orange-600 disabled:opacity-50"
    >
      <span>
        <span className="block text-[12px] font-semibold text-slate-900">{label}</span>
        <span className="block text-[10.5px] text-slate-400">{hint}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          on ? 'bg-gradient-to-br from-[#FE8C01] to-[#E05504]' : 'bg-slate-300'
        }`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${on ? 'left-4.5' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

/** The two buttons every studio ends with, wired to that studio's queue. */
export function PanelActions({ kind, canConvert }: { kind: MediaKind; canConvert: boolean }) {
  // Filter after selecting — see the note in StudioShell.
  const items = useConverterStore((s) => s.items).filter((i) => i.kind === kind)
  const running = useConverterStore((s) => s.running)
  const convertAll = useConverterStore((s) => s.convertAll)
  const downloadAll = useConverterStore((s) => s.downloadAll)

  const pending = items.filter((i) => i.status === 'queued' || i.status === 'failed').length
  const doneCount = items.filter((i) => i.result).length
  const enabled = canConvert && pending > 0 && !running

  return (
    <>
      <button
        type="button"
        disabled={!enabled}
        onClick={() => void convertAll(kind)}
        className="w-full rounded-xl bg-gradient-to-br from-[#FE8C01] to-[#E05504] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-opacity hover:opacity-95 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {/* "and save" is not decoration: a single file downloads itself the
            moment it is done (see `convertAll`), and a button that starts a
            download should say so before it is pressed. */}
        {running ? 'Converting…' : pending === 1 ? 'Convert and save 1 file' : `Convert ${pending} files`}
      </button>

      <button
        type="button"
        disabled={doneCount === 0 || running}
        onClick={() => void downloadAll(kind)}
        className="w-full rounded-xl bg-orange-500/12 px-4 py-2.5 text-[13px] font-bold text-orange-800 transition-colors hover:bg-orange-500/20 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Download all as ZIP
      </button>

      <p className="text-center text-[10.5px] text-slate-400">
        Converted files are saved straight to your downloads.
      </p>
    </>
  )
}
