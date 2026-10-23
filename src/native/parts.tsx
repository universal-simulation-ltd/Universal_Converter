import type { ReactNode } from 'react'
import './native.css'

// The phone chrome's list cards. The pages, bottom sheets, gestures and the
// sheets that stand in for alert() and confirm() come from @unisim/sdk's phone
// kit (PhonePage, BottomSheet, phoneAlert / phoneConfirm, since 0.203.0;
// README ▸ "Phone pages, sheets and gestures"), which holds the suite's rules
// for them (Docs_UNI_SIM/BRANDING.md: "A swipe from the left edge goes back",
// "A big swipe down closes a drawer; a short pull puts you in its box", "A row
// that scrolls shows it scrolls").

function Chevron({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

/** A white rounded card of rows. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:divide-slate-800 ${className}`}>
      {children}
    </div>
  )
}

/** A heading over a card. */
export function CardLabel({ children }: { children: ReactNode }) {
  return <h2 className="px-1 pt-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</h2>
}

/** One row of a card that does something or goes somewhere. */
export function Row({
  label,
  sub,
  icon,
  value,
  onClick,
  danger,
  disabled,
  chevron = true,
}: {
  label: string
  sub?: string
  icon?: ReactNode
  value?: ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  chevron?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full min-h-[52px] items-center gap-3 px-4 py-2 text-left active:bg-slate-100 disabled:opacity-40 dark:active:bg-slate-800"
    >
      {icon && <span className="flex w-6 shrink-0 justify-center text-[18px]" aria-hidden="true">{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`text-[16px] ${danger ? 'text-red-700 dark:text-red-400' : ''}`}>{label}</span>
        {sub && <span className="text-[13px] leading-snug text-slate-500 dark:text-slate-400">{sub}</span>}
      </span>
      {value && <span className="shrink-0 text-[15px] text-slate-500 dark:text-slate-400">{value}</span>}
      {chevron && <Chevron className="h-4 w-4 shrink-0 text-slate-400" />}
    </button>
  )
}

