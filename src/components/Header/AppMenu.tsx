import { useEffect, useRef, useState } from 'react'
import { useConverterStore } from '../../stores/converterStore'

// The per-app "Actions" dropdown that slots into <UniversalAppsNavBar />.
// Everything here is local: clearing the queue drops the files from memory, it
// doesn't delete anything on disk.
export default function AppMenu() {
  const items = useConverterStore((s) => s.items)
  const running = useConverterStore((s) => s.running)
  const clearQueue = useConverterStore((s) => s.clearQueue)
  const resetSettings = useConverterStore((s) => s.resetSettings)

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="h-8 px-3 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium ring-1 ring-slate-200 flex items-center gap-1.5"
      >
        Actions
        <svg viewBox="0 0 12 12" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-60 bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden">
          <button
            onClick={() => {
              clearQueue()
              setOpen(false)
            }}
            disabled={running || items.length === 0}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-orange-50 hover:text-orange-700 text-sm disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-900"
          >
            <span aria-hidden="true">🧹</span>
            <span className="flex-1 text-left font-medium">Clear the queue</span>
          </button>
          <button
            onClick={() => {
              resetSettings()
              setOpen(false)
            }}
            disabled={running}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-orange-50 hover:text-orange-700 text-sm border-t border-slate-100 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-900"
          >
            <span aria-hidden="true">↩️</span>
            <span className="flex-1 text-left font-medium">Reset output settings</span>
          </button>
        </div>
      )}
    </div>
  )
}
