import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { useEdgeSwipeBack } from './edgeSwipe'
import { useBackCloses } from './layers'
import { PHONE } from './shell'
import { useNT } from './strings'
import './native.css'

// The phone chrome's building blocks: a page that slides in over the app and
// goes back on a swipe from the left edge, a bottom sheet that a big swipe
// down closes, list cards, and the sheet that stands in for alert() and
// confirm(). Lifted from Universal PDF's `src/native/parts.tsx` and
// `edgeSwipe.ts`, the suite's reference for these rules
// (Docs_UNI_SIM/BRANDING.md: "A swipe from the left edge goes back", "A big
// swipe down closes a drawer; a short pull puts you in its box", "A row that
// scrolls shows it scrolls"). The SDK does not carry them yet.
//
// Stacking: the SDK navbar is z 1000 and the website's dialogs 1100, so a
// page is 1200, a sheet 1300 (a sheet can open over a page) and the
// alert/confirm sheet 1400.

const Z_PAGE = 1200
const Z_SHEET = 1300
const Z_NOTICE = 1400

function useFocusIn(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    ref.current?.focus({ preventScroll: true })
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true })
    }
  }, [ref])
}

function Chevron({ dir = 'left', className = 'h-5 w-5' }: { dir?: 'left' | 'right'; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  )
}

/**
 * A page of its own: a back link with the title, and a body that scrolls.
 * It is open while it is mounted. Back (its link, a swipe in from the left
 * edge, Android's back) calls `onBack`, and Escape does too. A pull down from
 * the top of a page with a text box puts the finger in the box.
 */
export function Page({
  title,
  onBack,
  canGoBack = true,
  children,
  footer,
}: {
  title: string
  onBack: () => void
  /** False while something on the page must not be left (a scrub running). */
  canGoBack?: boolean
  children: ReactNode
  /** Pinned under the body (an action row). */
  footer?: ReactNode
}) {
  const t = useNT()
  const ref = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const back = () => {
    if (!canGoBack) return false
    onBack()
  }
  useBackCloses(true, back)
  useEdgeSwipeBack(ref, canGoBack, back)
  usePagePullToType(bodyRef, true)
  useFocusIn(ref)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canGoBack) {
        e.preventDefault()
        onBack()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [canGoBack, onBack])

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      data-phone-page=""
      className="pp-page fixed inset-0 flex flex-col bg-slate-50 text-slate-900 outline-none dark:bg-slate-950 dark:text-slate-100"
      style={{ zIndex: Z_PAGE }}
    >
      <header
        className="shrink-0 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="relative flex min-h-[52px] items-center px-1.5">
          <button
            type="button"
            onClick={back}
            disabled={!canGoBack}
            className="relative z-10 flex min-h-[44px] items-center gap-0.5 rounded-lg px-2 text-[16px] text-orange-700 disabled:opacity-40 dark:text-orange-400"
          >
            <Chevron />
            {t('back')}
          </button>
          <h1 className="pointer-events-none absolute inset-x-24 truncate text-center text-[16px] font-semibold">{title}</h1>
        </div>
      </header>
      <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {children}
        {!footer && <div style={{ height: 'calc(env(safe-area-inset-bottom) + 16px)' }} />}
      </div>
      {footer && (
        <div
          className="shrink-0 border-t border-slate-200 bg-white px-4 pt-3 dark:border-slate-800 dark:bg-slate-900"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        >
          {footer}
        </div>
      )}
    </div>,
    document.body,
  )
}

/**
 * A bottom sheet over a scrim. The scrim, Escape, Android's back, a drag on
 * the grip or a big swipe down anywhere on it closes it.
 */
export function Sheet({
  label,
  onClose,
  children,
  z = Z_SHEET,
}: {
  label: string
  onClose: () => void
  children: ReactNode
  z?: number
}) {
  const ref = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const grip = useSheetPull(ref, onClose)
  useSheetBodyPull(ref, bodyRef, onClose)
  useBackCloses(true, onClose)
  useFocusIn(ref)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: z }} data-phone-sheet="">
      <div className="pp-scrim absolute inset-0 bg-slate-950/45" onClick={onClose} aria-hidden="true" />
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="pp-sheet absolute inset-x-0 bottom-0 flex flex-col rounded-t-[22px] bg-slate-50 text-slate-900 shadow-2xl outline-none dark:bg-slate-900 dark:text-slate-100"
        style={{
          maxHeight: 'calc(100% - env(safe-area-inset-top) - 32px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)',
        }}
      >
        <div {...grip} data-sheet-grip="" className="flex flex-none cursor-grab touch-none justify-center pt-2 pb-2">
          <div className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
        </div>
        {/* Children never shrink: a menu taller than the sheet scrolls rather
            than squashing its last card (Universal PDF, 2026-10-22). */}
        <div ref={bodyRef} className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-4 [&>*]:flex-none">
          {children}
        </div>
      </section>
    </div>,
    document.body,
  )
}

type GripProps = Pick<
  React.HTMLAttributes<HTMLDivElement>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
>

/** The grip brings the sheet down with the finger; past a third (or a flick) it closes. */
function useSheetPull(ref: React.RefObject<HTMLElement | null>, onClose: () => void): GripProps {
  const drag = useRef<{ y: number; dy: number; t: number; v: number } | null>(null)
  const close = useRef(onClose)
  close.current = onClose

  function finish(cancelled: boolean) {
    const d = drag.current
    drag.current = null
    const el = ref.current
    if (!d || !el) return
    const away = !cancelled && (d.dy > Math.min(140, el.offsetHeight / 3) || (d.v > 0.5 && d.dy > 16))
    el.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)'
    if (away) {
      el.style.transform = `translateY(${el.offsetHeight + 24}px)`
      window.setTimeout(() => close.current(), 160)
    } else {
      el.style.transform = ''
    }
  }

  return {
    onPointerDown(e) {
      const el = ref.current
      if (!el) return
      drag.current = { y: e.clientY, dy: 0, t: e.timeStamp, v: 0 }
      e.currentTarget.setPointerCapture(e.pointerId)
      el.getAnimations?.().forEach((a) => a.cancel())
      el.style.animation = 'none'
      el.style.transition = 'none'
    },
    onPointerMove(e) {
      const d = drag.current
      const el = ref.current
      if (!d || !el) return
      const dy = Math.max(0, e.clientY - d.y)
      const dt = e.timeStamp - d.t
      if (dt > 0) d.v = (dy - d.dy) / dt
      d.dy = dy
      d.t = e.timeStamp
      el.style.transform = dy ? `translateY(${dy}px)` : ''
    },
    onPointerUp: () => finish(false),
    onPointerCancel: () => finish(true),
  }
}

// Where a pull down must not be taken over: a box being typed in, a slider,
// a sideways row, anything drawn on.
const PULL_EXEMPT = 'input, textarea, select, canvas, [contenteditable="true"], [data-swipe-x], [data-sheet-grip]'
const TYPE_BOX = 'input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="email"], input[type="tel"], input[type="number"], textarea'

function firstTypeBox(root: HTMLElement | null): HTMLInputElement | HTMLTextAreaElement | null {
  if (!root) return null
  for (const el of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(TYPE_BOX)) {
    if (el.disabled || el.readOnly) continue
    if (el.getClientRects().length === 0) continue
    return el
  }
  return null
}

/**
 * A big swipe down anywhere on a sheet closes it; a shorter one puts the
 * finger in its text box, if it has one. Only from the top of the sheet's own
 * scroll, only a mostly downward pull. The focus is made in the touch's
 * release, the only place iOS raises the keyboard for it.
 */
function useSheetBodyPull(
  sheetRef: React.RefObject<HTMLElement | null>,
  bodyRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const sheet = sheetRef.current
    const body = bodyRef.current
    if (!sheet || !body) return
    let g: { x: number; y: number; dy: number; t: number; v: number; pull: boolean | null } | null = null
    const onStart = (e: TouchEvent) => {
      g = null
      if (e.touches.length !== 1) return
      const target = e.target as Element | null
      if (target?.closest?.(PULL_EXEMPT)) return
      if (body.scrollTop > 0) return
      const tt = e.touches[0]
      g = { x: tt.clientX, y: tt.clientY, dy: 0, t: e.timeStamp, v: 0, pull: null }
    }
    const onMove = (e: TouchEvent) => {
      if (!g) return
      const tt = e.touches[0]
      const dx = tt.clientX - g.x
      const dy = tt.clientY - g.y
      if (g.pull === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        g.pull = dy > 0 && dy > Math.abs(dx) * 1.2 && body.scrollTop <= 0
        if (!g.pull) {
          g = null
          return
        }
        sheet.getAnimations?.().forEach((a) => a.cancel())
        sheet.style.animation = 'none'
        sheet.style.transition = 'none'
      }
      e.preventDefault()
      const d = Math.max(0, dy)
      const dt = e.timeStamp - g.t
      if (dt > 0) g.v = (d - g.dy) / dt
      g.dy = d
      g.t = e.timeStamp
      sheet.style.transform = d ? `translateY(${d}px)` : ''
    }
    const onEnd = () => {
      const d = g
      g = null
      if (!d?.pull) return
      const big = d.dy > Math.min(180, sheet.offsetHeight * 0.4) || (d.v > 0.8 && d.dy > 90)
      sheet.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)'
      if (big) {
        sheet.style.transform = `translateY(${sheet.offsetHeight + 24}px)`
        window.setTimeout(() => close.current(), 160)
        return
      }
      sheet.style.transform = ''
      if (d.dy > 36) firstTypeBox(body)?.focus()
    }
    sheet.addEventListener('touchstart', onStart, { passive: true })
    sheet.addEventListener('touchmove', onMove, { passive: false })
    sheet.addEventListener('touchend', onEnd)
    sheet.addEventListener('touchcancel', onEnd)
    return () => {
      sheet.removeEventListener('touchstart', onStart)
      sheet.removeEventListener('touchmove', onMove)
      sheet.removeEventListener('touchend', onEnd)
      sheet.removeEventListener('touchcancel', onEnd)
    }
  }, [sheetRef, bodyRef])
}

/** The nearest scrolling box between `el` and `root`, or `root`. */
function scrollerOf(el: Element | null, root: HTMLElement): HTMLElement {
  for (let n = el as HTMLElement | null; n && n !== root; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n
  }
  return root
}

/**
 * A pull down on a page puts the finger in its text box, keyboard up. The
 * page never focuses a box on arrival, so the keyboard comes up only when
 * asked for. The page gives a little with the finger so the pull is felt.
 */
function usePagePullToType(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const page = ref.current
    if (!page || !enabled) return
    let g: { x: number; y: number; dy: number; scroller: HTMLElement; pull: boolean | null } | null = null
    const onStart = (e: TouchEvent) => {
      g = null
      if (e.touches.length !== 1) return
      const target = e.target as Element | null
      if (target?.closest?.(PULL_EXEMPT)) return
      if (!firstTypeBox(page)) return
      const scroller = scrollerOf(target, page)
      if (scroller.scrollTop > 0) return
      const tt = e.touches[0]
      g = { x: tt.clientX, y: tt.clientY, dy: 0, scroller, pull: null }
    }
    const onMove = (e: TouchEvent) => {
      if (!g) return
      const tt = e.touches[0]
      const dx = tt.clientX - g.x
      const dy = tt.clientY - g.y
      if (g.pull === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        g.pull = dy > 0 && dy > Math.abs(dx) * 1.2 && g.scroller.scrollTop <= 0
        if (!g.pull) {
          g = null
          return
        }
        page.style.transition = 'none'
      }
      e.preventDefault()
      g.dy = Math.max(0, dy)
      page.style.transform = `translateY(${Math.min(48, g.dy * 0.35)}px)`
    }
    const onEnd = () => {
      const d = g
      g = null
      if (!d?.pull) return
      page.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)'
      page.style.transform = ''
      if (d.dy > 50) firstTypeBox(page)?.focus()
    }
    page.addEventListener('touchstart', onStart, { passive: true })
    page.addEventListener('touchmove', onMove, { passive: false })
    page.addEventListener('touchend', onEnd)
    page.addEventListener('touchcancel', onEnd)
    return () => {
      page.removeEventListener('touchstart', onStart)
      page.removeEventListener('touchmove', onMove)
      page.removeEventListener('touchend', onEnd)
      page.removeEventListener('touchcancel', onEnd)
    }
  }, [ref, enabled])
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
      {chevron && <Chevron dir="right" className="h-4 w-4 shrink-0 text-slate-400" />}
    </button>
  )
}

/**
 * A row that scrolls sideways shows that it does: a fade at each edge with
 * more beyond it (BRANDING.md, "A row that scrolls shows it scrolls"). Spread
 * `style` onto the scroller and give it `ref`.
 */
export function useScrollHint<T extends HTMLElement>(): { ref: React.RefObject<T>; style: React.CSSProperties } {
  const ref = useRef<T>(null)
  const [edges, setEdges] = useState({ start: false, end: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth
      setEdges({ start: el.scrollLeft > 2, end: el.scrollLeft < max - 2 })
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const child of el.children) ro.observe(child)
    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [])
  const FADE = 28
  const mask =
    edges.start || edges.end
      ? `linear-gradient(to right, ${edges.start ? 'transparent' : '#000'} 0, #000 ${edges.start ? FADE : 0}px, #000 calc(100% - ${edges.end ? FADE : 0}px), ${edges.end ? 'transparent' : '#000'} 100%)`
      : undefined
  return { ref, style: mask ? { maskImage: mask, WebkitMaskImage: mask } : {} }
}

// ── alert() and confirm(), the phone's way ──────────────────────────────────
//
// A browser alert in the app reads "localhost says…" on Android and stops the
// web view dead. On the phone the same words come up in a bottom sheet; the
// website and the desktop app keep the browser's own.

type Ask = { message: string; yes?: string; danger?: boolean; resolve: (ok: boolean) => void }
const useAsk = create<{ ask: Ask | null }>(() => ({ ask: null }))

/** `alert()` on the website; a sheet with OK on the phone. */
export function say(message: string): void {
  if (!PHONE) {
    window.alert(message)
    return
  }
  useAsk.setState({ ask: { message, resolve: () => {} } })
}

/** `confirm()` on the website; a sheet with `yes` and Cancel on the phone. */
export function ask(message: string, yes: string, danger = true): Promise<boolean> {
  if (!PHONE) return Promise.resolve(window.confirm(message))
  return new Promise((resolve) => {
    useAsk.setState({ ask: { message, yes, danger, resolve } })
  })
}

/** Mount once in the phone chrome. */
export function AskHost() {
  const t = useNT()
  const a = useAsk((s) => s.ask)
  if (!a) return null
  const done = (ok: boolean) => {
    useAsk.setState({ ask: null })
    a.resolve(ok)
  }
  return (
    <Sheet label={a.message} onClose={() => done(false)} z={Z_NOTICE}>
      <p className="px-1 pt-1 text-center text-[16px] leading-snug">{a.message}</p>
      {a.yes ? (
        <>
          <button
            type="button"
            onClick={() => done(true)}
            className={`min-h-[50px] rounded-2xl text-[17px] font-semibold text-white ${a.danger ? 'bg-red-600' : 'bg-orange-700'}`}
          >
            {a.yes}
          </button>
          <button
            type="button"
            onClick={() => done(false)}
            className="min-h-[50px] rounded-2xl border border-slate-200 bg-white text-[17px] dark:border-slate-700 dark:bg-slate-800"
          >
            {t('sdk:prefs.reset_cancel')}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => done(true)}
          className="min-h-[50px] rounded-2xl bg-orange-700 text-[17px] font-semibold text-white"
        >
          {t('ok')}
        </button>
      )}
    </Sheet>
  )
}
