// GENERATED FILE — do not edit by hand.
// Source: backoffice/universal-platform/scripts/app-marks/marks.mjs
// Regenerate: node scripts/app-marks/build.mjs (from backoffice/universal-platform)
// Mark: Universal Converter — A conversion ring around a waveform — format in, format out.
// Hover: The ring turns half a revolution while the waveform plays.
//
// Icon-only by design: the SDK's UniversalAppsNavBar renders the product name
// from its catalogue beside this slot, so a wordmark here would print it twice.

const CSS = `
  /* Resting states */
  .uam-converter-ring { transform: rotate(0deg); transition: transform .7s cubic-bezier(0.16,1,0.3,1); transform-origin: 32px 32px; }
  .uam-converter-bar1 { transform: scaleY(0.5); transition: transform .35s ease .05s; transform-origin: center; transform-box: fill-box; }
  .uam-converter-bar2 { transform: scaleY(0.5); transition: transform .35s ease 0s; transform-origin: center; transform-box: fill-box; }
  .uam-converter-bar3 { transform: scaleY(0.5); transition: transform .35s ease .1s; transform-origin: center; transform-box: fill-box; }

  /* Active states */
  .uam-host-converter:hover .uam-converter-ring,
  .uam-host-converter:focus-visible .uam-converter-ring { transform: rotate(180deg); }
  .uam-host-converter:hover .uam-converter-bar1,
  .uam-host-converter:focus-visible .uam-converter-bar1 { transform: scaleY(1); }
  .uam-host-converter:hover .uam-converter-bar2,
  .uam-host-converter:focus-visible .uam-converter-bar2 { transform: scaleY(1); }
  .uam-host-converter:hover .uam-converter-bar3,
  .uam-host-converter:focus-visible .uam-converter-bar3 { transform: scaleY(1); }

  @media (prefers-reduced-motion: reduce) {
    .uam-converter-ring,
    .uam-converter-bar1,
    .uam-converter-bar2,
    .uam-converter-bar3 { transition: none !important; }
  }
`

export default function ProductLogo() {
  return (
    <span
      className="uam-host-converter inline-flex h-6 w-6 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      <style>{CSS}</style>
      <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden="true">
        <defs>
          <linearGradient id="uam-nav-converter-tile" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fe8c01" />
            <stop offset="1" stopColor="#e05504" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="url(#uam-nav-converter-tile)" />
        <g fill="none" strokeWidth={4.4} strokeLinecap="round" strokeLinejoin="round" stroke="#ffffff" className="uam-converter-ring">
          <path d="M16 26.2A17 17 0 0 1 48 26.2" />
          <path d="M42.4 23.2 48 26.2 45.2 32" />
          <path d="M48 37.8A17 17 0 0 1 16 37.8" />
          <path d="M21.6 40.8 16 37.8 18.8 32" />
        </g>
        <rect x={25.2} y={27.2} width={3.6} height={9.6} rx={1.8} fill="#fed7aa" className="uam-converter-bar1" />
        <rect x={30.2} y={22.8} width={3.6} height={18.4} rx={1.8} fill="#fed7aa" className="uam-converter-bar2" />
        <rect x={35.2} y={28.4} width={3.6} height={7.2} rx={1.8} fill="#fed7aa" className="uam-converter-bar3" />
      </svg>
    </span>
  )
}
