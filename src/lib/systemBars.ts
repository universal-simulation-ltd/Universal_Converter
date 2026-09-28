import { useEffect } from 'react'
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'

/**
 * Keeps the native status-bar glyphs legible against whatever is behind them.
 *
 * capacitor.config.ts starts Capacitor's SystemBars at `LIGHT` (dark glyphs),
 * which is right for a strip Android paints itself: on a WebView older than
 * Chromium 140 SystemBars pads the page out from under the status bar, and
 * that strip is the window background, pinned white in values/colors.xml.
 * Wherever the PAGE is drawn under the status bar instead — every iPhone, and
 * an Android WebView from Chromium 140 — what sits behind the glyphs is this
 * app's own navbar, which is dark in the Dark theme. So the glyphs follow the
 * app's resolved theme there, and stay dark over the white strip everywhere
 * else.
 *
 * "Under the status bar" is read from `env(safe-area-inset-top)`: non-zero
 * exactly when the page reaches the top edge (iOS always; Android only on the
 * edge-to-edge path, where SystemBars passes the real insets through). A
 * ResizeObserver on the probe re-reads it whenever it changes — the inset can
 * arrive after first paint, and rotation changes it — since the probe's
 * border box is exactly that padding.
 *
 * ⚠️ Set through SystemBars, never `@capacitor/status-bar`: SystemBars
 * re-applies its own stored style on every Android configuration change and
 * would silently revert a style set any other way.
 */
export function useSystemBarsStyle(theme: 'light' | 'dark') {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)'
    document.body.appendChild(probe)
    let applied: SystemBarsStyle | undefined
    const apply = () => {
      const underBar = parseFloat(getComputedStyle(probe).paddingTop) > 0
      const style = underBar && theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light
      if (style === applied) return
      applied = style
      SystemBars.setStyle({ style }).catch(() => {})
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(probe, { box: 'border-box' })
    return () => {
      observer.disconnect()
      probe.remove()
    }
  }, [theme])
}
