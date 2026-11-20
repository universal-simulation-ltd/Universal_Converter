import { useEffect, useRef } from 'react'
import { phoneListCopy, useLanguage, useUndo } from '@unisim/sdk'
import { useNT } from './strings'

// "Delete offers Undo" (BRANDING.md ▸ "A deletable row swipes: delete one way,
// a second action the other"): a row swiped off the queue can be put back for
// six seconds. The countdown is the SDK phone kit's `useUndo`; this is the
// toast that shows it.
//
// It lives with the phone chrome, not with the list, because the list can go
// with the row: taking the last file off a tab swaps the queue for the drop
// ring, and the Undo has to outlast that.

export interface UndoOffer {
  /** The file's name, for "Removed …". */
  name: string
  /** Put it back. */
  restore: () => void
}

let offerTo: ((offer: UndoOffer) => void) | null = null

/** A row has gone: offer it back (a no-op until the toast is mounted). */
export function offerUndo(offer: UndoOffer): void {
  offerTo?.(offer)
}

/** Mounted once, with the phone chrome. */
export function UndoToast() {
  const t = useNT()
  const { language } = useLanguage()
  const undo = useUndo<UndoOffer>((offer) => offer.restore())
  const live = useRef(undo)
  live.current = undo
  useEffect(() => {
    offerTo = (offer) => live.current.deleted(offer)
    return () => {
      offerTo = null
    }
  }, [])
  if (!undo.item) return null
  return (
    <div
      role="status"
      data-undo-toast
      // Above the docked section tabs (--u-dock-space, which already counts
      // the home indicator), or above the home indicator where there are none.
      className="fixed left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-900 px-4 py-2.5 text-[15px] text-white shadow-xl dark:bg-slate-100 dark:text-slate-950"
      style={{ bottom: 'calc(1rem + max(var(--u-dock-space, 0px), env(safe-area-inset-bottom, 0px)))' }}
    >
      <span className="min-w-0 truncate">{t('app.removed_named', { name: undo.item.name })}</span>
      <button
        type="button"
        onClick={() => void undo.undo()}
        className="shrink-0 min-h-[36px] px-1 font-semibold text-orange-400 dark:text-orange-700"
      >
        {phoneListCopy(language).undo}
      </button>
    </div>
  )
}
