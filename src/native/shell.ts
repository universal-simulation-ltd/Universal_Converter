import { Capacitor } from '@capacitor/core'

// Does this run the phone's own chrome (`src/native/`)?
//
// The iOS and Android apps open nothing the website's way: no navbar dropdown,
// no centred dialog, no browser alert (James, 2026-10-11;
// Docs_UNI_SIM/store-listings/README.md §7). Every one of them is a page that
// slides in and goes back on a swipe from the left edge, a bottom sheet that a
// swipe down closes, or the system's own picker. The website and the desktop
// app keep their dialogs: this only answers true inside the Capacitor shell.
//
// In `npm run dev`, `?app` shows the phone chrome in a browser (it sticks for
// the tab; `?app=0` turns it off), so it can be checked at 393px without a
// device. A production build ignores the address entirely.

const DEV_KEY = 'converter:dev-phone-screens'

function decide(): boolean {
  if (Capacitor.isNativePlatform()) return true
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  try {
    const q = new URLSearchParams(window.location.search).get('app')
    if (q !== null) sessionStorage.setItem(DEV_KEY, q === '0' ? '0' : '1')
    return sessionStorage.getItem(DEV_KEY) === '1'
  } catch {
    return false
  }
}

/** Read once at load: the shell never changes under a running app. */
export const PHONE = decide()
