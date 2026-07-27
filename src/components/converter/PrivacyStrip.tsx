import type { MediaKind } from '../../lib/types'

// The one place the product's whole claim is stated. It sits above the studio on
// every visit — not as a dismissible banner — because "does this upload my
// file?" is the first question anyone arriving from a search has.
//
// Green, not the brand orange: this is a reassurance, and an orange strip with a
// lock in it reads as a warning at a glance — the opposite of what it says. The
// hue is the suite's semantic "good" (#2F9E57 in BRANDING.md), with a darker
// green for the text so it clears contrast on the tint.
export default function PrivacyStrip({ kind, engineBadge }: { kind: MediaKind; engineBadge: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[#2F9E57]/25 bg-[#2F9E57]/10 px-3.5 py-2.5 text-[13px] text-[#166534]">
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="10" width="16" height="11" rx="2.5" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
      <span>
        <strong className="font-semibold">Nothing is uploaded.</strong>{' '}
        {kind === 'audio'
          ? 'Your files are decoded and re-encoded here, in this tab.'
          : kind === 'video'
            ? 'Every frame is decoded and re-encoded here, in this tab.'
            : 'Your images are decoded, resized and re-encoded here, in this tab.'}
      </span>
      <span className="ml-auto rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-mono text-[10.5px] text-slate-600">
        {engineBadge}
      </span>
    </div>
  )
}
