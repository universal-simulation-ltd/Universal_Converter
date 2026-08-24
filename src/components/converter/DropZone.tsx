import { DropAnywhere, DropRing, useFileDrop } from '@unisim/sdk'
import { ConvertWatermark } from './DropWatermarks'

interface Props {
  onFiles: (files: File[]) => void
  /** 'empty' owns the whole column on first run; 'more' is the compact footer. */
  variant: 'empty' | 'more'
  accept: string
  title: string
  formatsLine: string
}

/**
 * The per-studio drop target.
 *
 * The empty state is THE SAME CIRCLE the All tab and Universal Compress open
 * with — `DropRing` from the SDK, not a copy — because arriving on the Audio tab
 * and arriving on the All tab are the same moment: you have a file and you are
 * looking for where to put it. A dashed rectangle here and a twinkling circle
 * one tab across made the five tabs feel like five apps that happen to share a
 * navbar, which is the opposite of what one converter is for.
 *
 * `motion="idle"` and never `busy`: the twinkle says "alive and waiting", and a
 * page that greets you with a spinner reads as a page still loading. Progress
 * belongs on the queue rows, where it is per-file and true.
 *
 * The 'more' footer stays a compact strip. Once the queue is the thing you are
 * reading, a second 300px circle beneath it is a lot of column for "and these
 * as well", and the queue is what the eye should land on.
 *
 * The MECHANICS — drag depth, the hidden input, click/Enter/Space, resetting
 * the input value — come from the SDK's `useFileDrop`, shared with Compress,
 * Video and the All tab. The bug that bought: `onDragLeave` used to fire as the
 * pointer crossed the icon or the caption inside the box, so the highlight
 * flickered while a file was held over it. A depth counter, not a timer, is the
 * fix, and it now lives once.
 *
 * `pageWide` for the same reason the All tab uses it: once the queue is long,
 * the "add more" strip is a thin bar below the fold, and aiming at it is work
 * the app can do for you. Only one of these is ever mounted (empty state OR the
 * footer, and one studio tab at a time), so exactly one owns the page.
 */
export default function DropZone({ onFiles, variant, accept, title, formatsLine }: Props) {
  const drop = useFileDrop({
    onFiles,
    accept,
    label: `${title} — click to browse`,
    pageWide: true,
  })

  if (variant === 'empty') {
    return (
      <div className="flex flex-col items-center gap-5 px-4 py-8 sm:px-8">
        <div
          {...drop.dropzoneProps}
          className="relative w-full max-w-[300px] cursor-pointer rounded-full transition-transform focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600"
          style={drop.over ? { transform: 'scale(1.02)' } : undefined}
        >
          <DropRing size="100%" over={drop.over} motion="idle" watermark={<ConvertWatermark />}>
            <UploadGlyph over={drop.over} />
            <span className="text-[15px] font-bold leading-tight text-slate-900">{title}</span>
            <span className="mt-1 text-[11px] text-slate-400">or click to browse</span>
          </DropRing>
        </div>

        <input {...drop.inputProps} className="hidden" />

        {/* The format list lives UNDER the ring, not in it: eight extensions
            wrap to four lines inside a 300px circle, and the circle's job is to
            be aimed at. */}
        <p className="max-w-sm text-center text-[11.5px] leading-relaxed text-slate-500">
          {formatsLine}
        </p>

        <DropAnywhere show={drop.pageOver} hint={formatsLine} />
      </div>
    )
  }

  return (
    <>
      <div
        {...drop.dropzoneProps}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-5 py-6 text-center transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-orange-600 ${
          drop.over ? 'border-orange-500 bg-orange-50' : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
        }`}
      >
        <UploadGlyph over={drop.over} compact />
        <span className="text-[13.5px] font-semibold text-slate-900">{title}</span>
        <span className="text-[11.5px] text-slate-500">{formatsLine} — or click to browse</span>
      </div>

      {/* Outside the zone on purpose: a hidden input INSIDE a click-to-browse
          zone re-enters that zone's own onClick when it is clicked. */}
      <input {...drop.inputProps} className="hidden" />

      {/* The default "Drop anywhere" title, not this zone's own `title`: the
          zone already says what it takes, and the one thing the person aiming
          at the margin does not know is that they need not aim. */}
      <DropAnywhere show={drop.pageOver} hint={formatsLine} />
    </>
  )
}

/** One arrow going in. Same glyph both sizes, so the two states are one idea. */
function UploadGlyph({ over, compact = false }: { over: boolean; compact?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${compact ? 'h-5 w-5' : 'mb-1 h-9 w-9'} ${over ? 'text-orange-500' : 'text-slate-400'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={compact ? 2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}
