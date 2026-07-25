/**
 * Fit an image inside `maxEdge` on its longest side, keeping the aspect ratio
 * and never scaling up. Kept in its own leaf module — no imports — so
 * scripts/selftest.mjs can exercise it without pulling in anything that needs a
 * DOM.
 */
export function targetSize(
  width: number,
  height: number,
  maxEdge: number | 'source',
): { width: number; height: number } {
  if (maxEdge === 'source') return { width, height }
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
