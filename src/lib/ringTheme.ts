import { useThemeStore } from '../stores/themeStore'

/**
 * The SDK's <DropRing>, in dark mode.
 *
 * The ring is inline SVG with its colours baked into attributes, so it cannot
 * answer the `.dark` class by itself: the pills default to slate-300 and the
 * interior is a white disc, which in a dark app is a white hole in the card.
 * Two levers reach it without touching the SDK:
 *
 *  - `track` is a real prop, so the resting pills get a dark slate.
 *  - `className` lands on the ring's root, and `index.css` repaints the
 *    interior disc from `.dark .cnv-ring` (a CSS `fill` beats an SVG
 *    presentation attribute). `cnv-ring-over` is the drag-over state, which the
 *    SDK tints orange-50 in light.
 *
 * ⚠️ Light returns NOTHING, not the light values — so a light ring is exactly
 * the SDK's defaults, and nothing here can drift light away from the rest of
 * the suite. Spread it onto every <DropRing>: `<DropRing … {...ring}>`.
 */
const DARK_RING_TRACK = '#334155'

export function useRingColours(over = false): { className?: string; track?: string } {
  const dark = useThemeStore((s) => s.effective) === 'dark'
  if (!dark) return {}
  return { className: over ? 'cnv-ring cnv-ring-over' : 'cnv-ring', track: DARK_RING_TRACK }
}
