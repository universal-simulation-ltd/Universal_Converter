import { useFileDrop } from '@unisim/sdk'

interface Props {
  onFiles: (files: File[]) => void
  /** 'empty' owns the whole column on first run; 'more' is the compact footer. */
  variant: 'empty' | 'more'
  accept: string
  title: string
  formatsLine: string
}

/**
 * The per-studio drop target — a dashed rectangle, unlike the All tab's circle.
 *
 * The LOOK is the only thing left here. The mechanics — drag depth, the hidden
 * input, click/Enter/Space, resetting the input value — come from the SDK's
 * `useFileDrop`, shared with Compress, Video and the All tab. The bug that
 * bought: `onDragLeave` used to fire as the pointer crossed the icon or the
 * caption inside this box, so the highlight flickered while a file was held
 * over it. A depth counter, not a timer, is the fix, and it now lives once.
 */
export default function DropZone({ onFiles, variant, accept, title, formatsLine }: Props) {
  const drop = useFileDrop({ onFiles, accept, label: `${title} — click to browse` })

  const empty = variant === 'empty'

  return (
    <>
      <div
        {...drop.dropzoneProps}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed text-center transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-orange-600 ${
          empty ? 'px-6 py-14' : 'px-5 py-6'
        } ${drop.over ? 'border-orange-500 bg-orange-50' : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'}`}
      >
        <svg viewBox="0 0 24 24" className={empty ? 'w-8 h-8 text-slate-400' : 'w-5 h-5 text-slate-400'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 16V4" />
          <path d="M7 9l5-5 5 5" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <span className={`font-semibold text-slate-900 ${empty ? 'text-base' : 'text-[13.5px]'}`}>{title}</span>
        <span className="text-[11.5px] text-slate-500">{formatsLine}</span>
      </div>

      {/* Outside the zone on purpose: a hidden input INSIDE a click-to-browse
          zone re-enters that zone's own onClick when it is clicked. */}
      <input {...drop.inputProps} className="hidden" />
    </>
  )
}
