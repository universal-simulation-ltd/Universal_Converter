import { useEffect } from 'react'
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { setAndroidWindowTheme } from '@unisim/sdk'

/**
 * Keeps the native status bar in step with the app's own resolved theme, live
 * — Light, Dark, or Match my device as the phone flips.
 *
 * What sits behind the status-bar glyphs:
 * - every iPhone, and an Android WebView from Chromium 140: the page itself,
 *   i.e. this app's navbar (index.html is `viewport-fit=cover` and pads by
 *   `env(safe-area-inset-*)`);
 * - an older Android WebView: a strip Capacitor's SystemBars pads the page out
 *   by, showing the WINDOW background. Android 15 ignores a status-bar colour
 *   set at run time, so @unisim/sdk's `setAndroidWindowTheme()` (its native
 *   UnisimWindowTheme plugin, registered by `cap sync`) repaints that
 *   background instead — the navbar's own surface colour, light or dark
 *   (android/…/values/colors.xml). It resolves false off Android.
 *
 * Either way the glyphs then follow the theme. On Android they only switch to
 * light once the strip has actually been repainted, so a failed repaint leaves
 * dark glyphs over the white strip rather than white on white.
 *
 * ⚠️ Glyphs are set through SystemBars, never `@capacitor/status-bar`:
 * SystemBars re-applies its own stored style on every Android configuration
 * change and would silently revert a style set any other way.
 */
export function useSystemBarsStyle(theme: 'light' | 'dark') {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    setAndroidWindowTheme(theme).then((repainted) => {
      if (cancelled) return
      const dark = theme === 'dark' && (repainted || Capacitor.getPlatform() === 'ios')
      SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})
    })
    return () => {
      cancelled = true
    }
  }, [theme])
}
