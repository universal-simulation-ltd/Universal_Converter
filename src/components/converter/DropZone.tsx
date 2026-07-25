import { useRef, useState } from 'react'
import { INPUT_ACCEPT } from '../../lib/formats'

interface Props {
  onFiles: (files: File[]) => void
  /** 'empty' owns the whole column on first run; 'more' is the compact footer. */
  variant: 'empty' | 'more'
}

export default function DropZone({ onFiles, variant }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) onFiles(files)
  }

  const empty = variant === 'empty'

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      role="button"
      tabIndex={0}
      className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed text-center transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-orange-600 ${
        empty ? 'px-6 py-14' : 'px-5 py-6'
      } ${over ? 'border-orange-500 bg-orange-50' : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'}`}
    >
      <svg viewBox="0 0 24 24" className={empty ? 'w-8 h-8 text-slate-400' : 'w-5 h-5 text-slate-400'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 16V4" />
        <path d="M7 9l5-5 5 5" />
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      <span className={`font-semibold text-slate-900 ${empty ? 'text-base' : 'text-[13.5px]'}`}>
        {empty ? 'Drop audio here to convert it' : 'Drop more audio here'}
      </span>
      <span className="text-[11.5px] text-slate-500">
        WAV, MP3, M4A/AAC, FLAC, OGG, Opus, AIFF, WebM — or click to browse
      </span>

      <input
        ref={inputRef}
        type="file"
        accept={INPUT_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length > 0) onFiles(files)
          // Reset so re-picking the same file fires change again.
          e.target.value = ''
        }}
      />
    </div>
  )
}
