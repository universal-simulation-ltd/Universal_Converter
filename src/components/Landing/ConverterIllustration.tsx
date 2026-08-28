import { useRef } from 'react'
import { useIllustrationClock } from '@unisim/sdk'

/** One sweep of the loop, frame 0 → frame 10, in ms. It runs straight back down. */
const SWEEP_MS = 5600

/**
 * The landing illustration: one file moves aside to make room, an arc hops
 * across the gap, and the file it turns into builds itself on the other side —
 * a .docx becoming a laid-out PDF, then three more conversions listed under it.
 * Then it unwinds and does it again.
 *
 * WHY TWO FILES AND NOT ONE MORPHING
 * ----------------------------------
 * Compress squeezes a file and hands the SAME file back smaller; this app hands
 * back a DIFFERENT file and keeps the original. So the original never leaves the
 * frame — it slides aside rather than transforming — which is the one thing
 * about a converter that people ask before they drop anything.
 *
 * ONE CLOCK, NOT SIX ANIMATIONS
 * -----------------------------
 * Copied from `ImageIllustration.tsx`, deliberately: everything is a window on
 * a single `--t`, 0 → 1, set here and read by `index.css`. Separate
 * `@keyframes`/transitions cannot do what this needs — an element part way
 * through a `@keyframes` cannot be told to return to its own first frame
 * (`animation-play-state: paused` freezes it wherever it stands, and removing
 * the animation snaps it). With one number, "return to frame 0" is one glide.
 *
 * ⚠️ This clock is now written FOUR times — here, Universal Compress, Universal
 * Images and Universal PDF. It should go to `@unisim/sdk` as a hook rather than
 * be pasted a fifth time: the mechanics (the rAF, the park, the mid-glide
 * resume) are identical and only the scene each one drives is per-app. Left
 * backlogged rather than done here, because it means a package publish and four
 * dependency bumps to land a refactor with no user-visible change.
 *
 * WHY HOVER STOPS IT RATHER THAN STARTING IT
 * ------------------------------------------
 * This sits beside the drop circle, so the pointer arriving means the user is
 * reading or aiming, and a picture that keeps moving under the cursor competes
 * with the thing they came to click. It settles on frame 0 and stays there.
 */
export default function ConverterIllustration() {
  const ref = useRef<HTMLDivElement>(null)
  useIllustrationClock(ref, { sweepMs: SWEEP_MS })

  return (
    <div ref={ref} className="cnv-illu relative w-full max-w-md aspect-square select-none">
      <svg
        viewBox="0 0 500 500"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <filter id="cnv-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#0f172a" floodOpacity="0.16" />
          </filter>
        </defs>

        {/* The file you brought. It starts in the middle of the frame — one
            file, on its own, which is where everybody actually starts — and
            slides left to make room rather than turning into the result.
            ⚠️ It never fades: the original is still on your disk afterwards,
            and a picture in which it disappears says the opposite. */}
        <g className="cnv-source">
          <rect x="40" y="132" width="150" height="214" rx="16" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" filter="url(#cnv-shadow)" />
          <rect x="56" y="150" width="68" height="28" rx="7" fill="#e0f2fe" />
          <text x="90" y="170" textAnchor="middle" fontSize="14.5" fontWeight="700" fill="#0369a1" fontFamily="ui-sans-serif, system-ui">
            DOCX
          </text>
          <rect x="56" y="202" width="118" height="10" rx="5" fill="#e2e8f0" />
          <rect x="56" y="224" width="118" height="10" rx="5" fill="#e2e8f0" />
          <rect x="56" y="246" width="118" height="10" rx="5" fill="#e2e8f0" />
          <rect x="56" y="268" width="78" height="10" rx="5" fill="#e2e8f0" />
        </g>

        {/* The conversion itself, in the gap the source just opened. It hops
            rather than pointing straight across, because a straight arrow
            between two identical cards reads as "and then", not "becomes". */}
        <path
          className="cnv-arc"
          d="M198 239 C222 183, 278 183, 302 239"
          fill="none"
          stroke="#ea580c"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={100}
        />
        {/* Drawn in absolute coordinates and rotated about its own tip, so the
            head lands ON the end of the arc and points along it. A tip-relative
            group would not work: `transform-box: view-box` resolves
            `transform-origin` against the SVG's own coordinate system, not the
            local one an ancestor translate sets up. */}
        <path className="cnv-head" d="M302 239 L294 226 L310 226 Z" fill="#ea580c" style={{ transformOrigin: '302px 239px' }} />

        {/* What you get back: a different file, built rather than revealed —
            the chip lands first, then the page fills in line by line. */}
        <g className="cnv-target" style={{ transformOrigin: '385px 239px' }}>
          <rect x="310" y="132" width="150" height="214" rx="16" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" filter="url(#cnv-shadow)" />
          <g className="cnv-chip" style={{ transformOrigin: '360px 164px' }}>
            <rect x="326" y="150" width="68" height="28" rx="7" fill="#fee2e2" />
            <text x="360" y="170" textAnchor="middle" fontSize="14.5" fontWeight="700" fill="#b91c1c" fontFamily="ui-sans-serif, system-ui">
              PDF
            </text>
          </g>
          {/* A heading and a laid-out block, not a copy of the source's three
              even lines — the Files tab does not photocopy a document, it sets
              it. Each grows from its left edge, in order, like type being set. */}
          <rect className="cnv-line cnv-line-1" x="326" y="202" width="92" height="14" rx="7" fill="#cbd5e1" style={{ transformOrigin: '326px 209px' }} />
          <rect className="cnv-line cnv-line-2" x="326" y="228" width="118" height="9" rx="4.5" fill="#e2e8f0" style={{ transformOrigin: '326px 232.5px' }} />
          <rect className="cnv-line cnv-line-3" x="326" y="246" width="118" height="9" rx="4.5" fill="#e2e8f0" style={{ transformOrigin: '326px 250.5px' }} />
          <rect className="cnv-line cnv-line-4" x="326" y="264" width="86" height="9" rx="4.5" fill="#e2e8f0" style={{ transformOrigin: '326px 268.5px' }} />
        </g>

        {/* Stamped on the corner last, and green rather than orange: this is the
            "it worked" beat, and orange here would read as one more step. */}
        <g className="cnv-tick" style={{ transformOrigin: '452px 142px' }}>
          <circle cx="452" cy="142" r="24" fill="#ecfdf5" stroke="#10b981" strokeWidth="2.5" />
          <path d="M441 142 l7.5 8 l14.5 -16" fill="none" stroke="#059669" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* And three more, because the two cards above can only ever show one
            pair. These are the other three tabs, named in the form people
            actually search for. */}
        <Pill className="cnv-pill cnv-pill-1" x={28} from="MOV" to="MP4" />
        <Pill className="cnv-pill cnv-pill-2" x={179} from="PNG" to="WebP" />
        <Pill className="cnv-pill cnv-pill-3" x={330} from="WAV" to="MP3" />
      </svg>
    </div>
  )
}

/** One "this → that" chip in the row along the bottom. */
function Pill({ className, x, from, to }: { className: string; x: number; from: string; to: string }) {
  const mid = x + 71
  return (
    <g className={className}>
      <rect x={x} y="398" width="142" height="36" rx="18" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
      <text x={mid} y="422" textAnchor="middle" fontSize="15.5" fontWeight="600" fill="#475569" fontFamily="ui-sans-serif, system-ui">
        {from} <tspan fill="#ea580c">→</tspan> {to}
      </text>
    </g>
  )
}
