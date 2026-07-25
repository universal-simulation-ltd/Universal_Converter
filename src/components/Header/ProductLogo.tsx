// Universal Converter brand icon — icon-only by design. The SDK's
// UniversalAppsNavBar renders the product name from its catalogue beside this
// slot, so adding a wordmark here would duplicate it.
//
// The mark: a conversion ring (two arcs, two arrowheads) around an audio
// waveform — "format in, format out", with the bars naming the phase that
// shipped first. Same drawing as the suite-switcher glyph and the app icon;
// keep all three in sync.
export default function ProductLogo() {
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-orange-600 text-white"
      aria-hidden="true"
    >
      {/* Weights are heavier than the 32-px switcher glyph on purpose: the same
          drawing at 16 px needs a thicker stroke and wider bars to stay legible. */}
      <svg viewBox="0 0 32 32" className="w-4.5 h-4.5" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 13.1A8.5 8.5 0 0 1 24 13.1" />
          <path d="M21.2 11.4 24 13.1 22.4 16" />
          <path d="M24 18.9A8.5 8.5 0 0 1 8 18.9" />
          <path d="M10.8 20.6 8 18.9 9.6 16" />
        </g>
        <g fill="currentColor">
          <rect x="11.9" y="13.4" width="2.4" height="5.2" rx="1.2" />
          <rect x="15.2" y="11.2" width="2.4" height="9.6" rx="1.2" />
          <rect x="18.5" y="14.2" width="2.4" height="3.6" rx="1.2" />
        </g>
      </svg>
    </span>
  )
}
