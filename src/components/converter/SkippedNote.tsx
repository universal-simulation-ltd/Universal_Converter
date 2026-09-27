/**
 * Files inside a dropped folder that nothing here converts. Counted, not named
 * — see `DropOutcome` — and neutral rather than amber: leaving them out is
 * what was asked for, not a problem to fix.
 */
export default function SkippedNote({ skipped, className = '' }: { skipped: number; className?: string }) {
  if (skipped === 0) return null
  return (
    <p className={`rounded-lg bg-slate-100 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600 dark:bg-slate-800 dark:text-slate-300 ${className}`}>
      Skipped {skipped} file{skipped === 1 ? '' : 's'} in the folder that {skipped === 1 ? 'isn’t' : 'aren’t'} a
      picture, a sound, a video or a document this can read.
    </p>
  )
}
