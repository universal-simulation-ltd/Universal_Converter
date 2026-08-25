/**
 * Backdrops for the drop circles.
 *
 * Two of them, because the app has two kinds of circle: a converter aimed at
 * one format pair, and the All tab, which takes anything. The All tab's is the
 * GENERIC drawing — the one any ring can wear when the app has nothing more
 * specific to say.
 *
 * Built to the same rule as Universal PDF's and Universal Images': STROKE ONLY,
 * no fills. The ring's interior is an opaque white circle, so pale fills have
 * nothing left to show once knocked back to a fraction of opacity — thin lines
 * are what survive.
 *
 * ⚠️ Render as a CHILD of <DropRing>, never behind it. DropRing paints that
 * white interior itself, so anything positioned behind the ring is covered.
 */

const LOOP_MS = 9000

// ⚠️ pathLength={100} everywhere, so the dash numbers are PERCENTAGES of each
// stroke and survive a curve being nudged. A wrong value does not error — it
// leaves the stroke half-drawn.
function css(prefix: string, steps: [string, number][]): string {
  const sel = steps.map(([c]) => `.${c}`).join(', ')
  return `
  ${sel} {
    stroke-dasharray: 100;
    stroke-dashoffset: 100;
    animation-duration: ${LOOP_MS}ms;
    animation-iteration-count: infinite;
    animation-timing-function: ease-in-out;
  }
  @keyframes ${prefix}-draw {
    0%        { stroke-dashoffset: 100; opacity: 0; }
    4%        { opacity: 1; }
    22%, 82%  { stroke-dashoffset: 0; opacity: 1; }
    94%, 100% { stroke-dashoffset: 0; opacity: 0; }
  }
  ${steps.map(([c, d]) => `.${c} { animation-name: ${prefix}-draw; animation-delay: ${d}ms; }`).join('\n  ')}

  /* ⚠️ Reduced motion gets the FINISHED drawing, not a slower loop and not
     frame 0 — frame 0 is an empty box, the least useful still of the set. */
  @media (prefers-reduced-motion: reduce) {
    ${sel} { animation: none; stroke-dashoffset: 0; opacity: 1; }
  }`
}

const INK = '#94a3b8'
const ACCENT = '#f97316'

/** One file becoming another — the whole of what this app does. */
export function ConvertWatermark() {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true" focusable="false">
      <style>{css('cw', [['cw-a', 0], ['cw-afold', 400], ['cw-arrow', 1400], ['cw-b', 2000], ['cw-bfold', 2400]])}</style>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Source file, left. Drawn from the fold so it arrives in one gesture. */}
        <path className="cw-a" pathLength={100} d="M40 30 H20 a3 3 0 0 0-3 3 v54 a3 3 0 0 0 3 3 h30 a3 3 0 0 0 3-3 V43 Z" stroke={INK} strokeWidth="1.6" />
        <path className="cw-afold" pathLength={100} d="M40 30 v13 h13" stroke={INK} strokeWidth="1.6" />

        {/* The conversion itself gets the accent — it is the verb. */}
        <path className="cw-arrow" pathLength={100} d="M58 60 h10 m-4-4 4 4 -4 4" stroke={ACCENT} strokeWidth="2.2" />

        {/* Result file, right. */}
        <path className="cw-b" pathLength={100} d="M96 30 H76 a3 3 0 0 0-3 3 v54 a3 3 0 0 0 3 3 h30 a3 3 0 0 0 3-3 V43 Z" stroke={INK} strokeWidth="1.6" />
        <path className="cw-bfold" pathLength={100} d="M96 30 v13 h13" stroke={INK} strokeWidth="1.6" />
      </g>
    </svg>
  )
}

/**
 * The generic: a document, a picture and a plain file, above the ring's centre.
 *
 * This is the fallback drawing — what a ring wears when the app behind it takes
 * anything, or has nothing more specific to say. The three shapes are what the
 * suite actually deals in; the thing you are aiming at is the ring itself, so
 * the backdrop stays out of the way of the copy in the middle of it.
 */
export function AnyFileWatermark() {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true" focusable="false">
      <style>{css('gw', [['gw-doc', 0], ['gw-pic', 500], ['gw-file', 1000]])}</style>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Three kinds of thing, sitting above the tray. Different shapes, not
            three copies of one icon — the point is that it takes anything.
            Kept HIGH and small, in the band above the ring's own centre glyph.
            ⚠️ Two earlier drafts collided here: the first ran an arrow through
            the headline, the second put the picture straight on top of the All
            tab's funnel glyph, and the two line drawings read as one scribble.
            The middle of this circle belongs to the ring, not the backdrop. */}
        <path className="gw-doc" pathLength={100} d="M29 10 H17 a2.5 2.5 0 0 0-2.5 2.5 v18 a2.5 2.5 0 0 0 2.5 2.5 h16 a2.5 2.5 0 0 0 2.5-2.5 V16.5 Z M29 10 v6.5 h6.5" stroke={INK} strokeWidth="1.5" />
        {/* The picture: a frame, a sun and one slope. Any more detail than that
            is mush at this size — the first draft's twin peaks read as a
            scribble. */}
        <path className="gw-pic" pathLength={100} d="M49 10 h22 a2.5 2.5 0 0 1 2.5 2.5 v18 a2.5 2.5 0 0 1-2.5 2.5 h-22 a2.5 2.5 0 0 1-2.5-2.5 v-18 a2.5 2.5 0 0 1 2.5-2.5 Z M48 27 l8-8 7 7" stroke={INK} strokeWidth="1.5" />
        <circle className="gw-pic" pathLength={100} cx="55" cy="17" r="2.4" stroke={INK} strokeWidth="1.4" />
        <path className="gw-file" pathLength={100} d="M101 10 H89 a2.5 2.5 0 0 0-2.5 2.5 v18 a2.5 2.5 0 0 0 2.5 2.5 h16 a2.5 2.5 0 0 0 2.5-2.5 V16.5 Z M101 10 v6.5 h6.5" stroke={INK} strokeWidth="1.5" />

        {/* ⚠️ NO TRAY along the bottom, and don't put one back. An orange
            open-topped tray used to sit at y=86–103 to carry the accent, and on
            the All tab it landed exactly where the centre stack's fourth line
            ("or click to browse") already is — a stroke half-hidden behind
            text, which reads as a box the circle has cut off rather than as a
            drawing. This backdrop only ever gets the BAND ABOVE the centre
            glyph; the accent is the ring's own pills, which are orange already
            and are the thing being aimed at. */}
      </g>
    </svg>
  )
}
