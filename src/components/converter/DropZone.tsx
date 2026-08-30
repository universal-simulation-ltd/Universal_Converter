import { DropAnywhere, DropRing, useFileDrop } from '@unisim/sdk'
import { ConvertWatermark } from './DropWatermarks'

interface Props {
  onFiles: (files: File[]) => void
  accept: string
  title: string
  formatsLine: string
}

/**
 * The tab's front door — the circle you arrive on when its queue is empty.
 *
 * It is THE SAME CIRCLE the All tab, the landing page and Universal Compress
 * open with — `DropRing` from the SDK, not a copy — because arriving on the
 * Audio tab and arriving on the All tab are the same moment: you have a file and
 * you are looking for where to put it. A dashed rectangle here and a twinkling
 * circle one tab across made the five tabs feel like five apps that happen to
 * share a navbar, which is the opposite of what one converter is for.
 *
 * `motion="idle"` and never `busy`: the twinkle says "alive and waiting", and a
 * page that greets you with a spinner reads as a page still loading. Progress
 * belongs on the queue rows, where it is per-file and true.
 *
 * ⚠️ It used to have a second, compact form — a dashed "drop more" strip under
 * the queue. That is gone (2026-08-30): once anything is queued the drop target
 * is the full circle in the RIGHT-hand column, sitting directly above the button
 * it feeds. See `StudioActions`. Two drop targets on one screen is two places to
 * aim and one of them is always the wrong one.
 *
 * The MECHANICS — drag depth, the hidden input, click/Enter/Space, resetting
 * the input value — come from the SDK's `useFileDrop`, shared with Compress,
 * Video and the All tab. The bug that bought: `onDragLeave` used to fire as the
 * pointer crossed the icon or the caption inside the box, so the highlight
 * flickered while a file was held over it. A depth counter, not a timer, is the
 * fix, and it now lives once.
 *
 * `pageWide` for the same reason the All tab uses it: the ring is where to aim,
 * not where you have to land — and without it a file dropped on the margin is
 * handed to the browser, which navigates away from the page. Only one drop
 * target is ever mounted (this OR the working circle, and one studio tab at a
 * time), so exactly one owns the page.
 */
export default function DropZone({ onFiles, accept, title, formatsLine }: Props) {
  const drop = useFileDrop({
    onFiles,
    accept,
    label: `${title} — click to browse`,
    pageWide: true,
  })

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

/** One arrow going in — the mark of the tab you have not yet dropped on. */
function UploadGlyph({ over }: { over: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`mb-1 h-9 w-9 ${over ? 'text-orange-500' : 'text-slate-400'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
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
