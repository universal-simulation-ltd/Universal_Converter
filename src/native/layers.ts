import { useEffect, useRef } from 'react'

// Android's back gesture (and a browser's Back, in the dev preview) closes the
// top page or sheet the phone chrome has open, instead of leaving the app.
//
// One history entry stands for "something is open", however many layers are
// stacked: Back closes the top layer, and if others are still open the entry
// is put back for the next one. Closing a layer from its own button, a swipe
// or the scrim takes the entry off again once nothing is left open. That is
// done a tick later, so a sheet that closes as the page it opened arrives
// (More ▸ Tune this app) hands the entry straight over rather than racing a
// `history.back()` against a `pushState()`.
//
// No address changes: the app has no routes, and a reload starts from the
// app's front screen as it always has.

/** `close` answers false when the layer can't close yet (a scrub running). */
type Entry = { close: () => boolean | void }

const stack: Entry[] = []
let armed = false
/** Pops we caused ourselves (taking the entry off), which must not close anything. */
let ownPops = 0

function arm() {
  if (armed) return
  armed = true
  window.history.pushState({ phoneLayer: true }, '')
}

function disarmSoon() {
  window.setTimeout(() => {
    if (stack.length > 0 || !armed) return
    armed = false
    ownPops++
    window.history.back()
  }, 0)
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ownPops > 0) {
      ownPops--
      return
    }
    if (!armed) return
    armed = false
    const top = stack.pop()
    // Not closable yet: it keeps its place, and Back is armed for it again.
    if (top && top.close() === false) stack.push(top)
    if (stack.length > 0) arm()
  })
}

/**
 * While `open`, Back closes this layer by calling `close` (the newest open
 * layer first).
 */
export function useBackCloses(open: boolean, close: () => boolean | void): void {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open) return
    const entry: Entry = { close: () => closeRef.current() }
    stack.push(entry)
    arm()
    return () => {
      const i = stack.indexOf(entry)
      if (i < 0) return // Back closed it.
      stack.splice(i, 1)
      if (stack.length === 0) disarmSoon()
    }
  }, [open])
}
