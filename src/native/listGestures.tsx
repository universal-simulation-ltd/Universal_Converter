import { useCallback, useEffect, useRef, useState } from 'react'
import { useHold, useLeaveSelection, useSelection, type SwipeAction } from '@unisim/sdk'
import { PHONE } from './shell'
import type { T } from './strings'

// The queue's phone gestures (BRANDING.md ▸ "A deletable row swipes: delete one
// way, a second action the other"): swipe LEFT to take a file off the queue
// (with Undo), swipe RIGHT to select it, hold to select. The gestures are the
// SDK phone kit's (`<SwipeRow>`, `useHold`, `useLeaveSelection`, 0.230); this
// is the actions' look and the glue to the suite's select-several bar
// (`useSelection` / `<SelectionBar action="remove">`).
//
// Remove, not Delete: the file leaves the queue, and the one on the phone it
// was picked from is untouched.

const MinusIcon = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12h8" />
  </svg>
)
const TickIcon = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.7 2.7L16.5 9.5" />
  </svg>
)

/** The right edge's action, uncovered by swiping LEFT. */
export function removeSwipe(t: T, name: string, onAction: () => void): SwipeAction {
  return { text: t('app.swipe_remove'), label: t('app.swipe_remove_named', { name }), icon: MinusIcon, tone: 'danger', onAction }
}

/** The left edge's action, uncovered by swiping RIGHT. */
export function selectSwipe(t: T, name: string, onAction: () => void): SwipeAction {
  return { text: t('app.swipe_select'), label: t('app.swipe_select_named', { name }), icon: TickIcon, tone: 'neutral', onAction }
}

/**
 * Selection mode for one list: a hold (or the Select swipe) ticks the row and
 * starts it; Done, Android's back and a swipe in from the left edge leave it.
 * `enabled` false (a conversion running, say) leaves it too.
 */
export function useListSelect(ids: readonly string[], enabled: boolean) {
  const [selecting, setSelecting] = useState(false)
  const sel = useSelection(ids)
  const selRef = useRef(sel)
  selRef.current = sel
  const leave = useCallback(() => {
    setSelecting(false)
    selRef.current.clear()
  }, [])
  const start = useCallback((id: string) => {
    setSelecting(true)
    selRef.current.setMany([id], true)
  }, [])
  useLeaveSelection(selecting, leave, { enabled: PHONE })
  const holdStart = useHold(start)
  useEffect(() => {
    if (selecting && (!enabled || ids.length === 0)) leave()
  }, [selecting, enabled, ids.length, leave])
  return { selecting, sel, start, leave, holdStart }
}
