import { DropAnywhere, DropRing, PrivacyNote, useFileDrop } from '@unisim/sdk'
import { CONTAINER } from '../../lib/layout'
import {
  ALL_ACCEPT, AUDIO_INPUT_EXTS, DOCUMENT_INPUT_EXTS, IMAGE_INPUT_EXTS, VIDEO_INPUT_EXTS,
} from '../../lib/formats'
import { AnyFileWatermark } from '../converter/DropWatermarks'
import ConverterIllustration from './ConverterIllustration'

/**
 * What the app opens on, before anything has been dropped.
 *
 * The same shape Universal PDF and Universal Images land on: the animated
 * illustration on the left, the headline and the drop circle on the right. It
 * replaced the All tab's working layout — circle on the left, a card listing
 * every accepted extension on the right — which was the right layout for
 * someone WITH files and a wall of text for someone arriving with a question.
 *
 * ⚠️ It is the All tab's empty state, not a separate route. `AllStudio` swaps
 * to the sorting layout the moment anything is queued, and the drop handler is
 * ITS handler passed down — the sorter, the rejection list and the counts all
 * still live in one place, so a file dropped here is sorted by exactly the same
 * code as a file dropped there.
 */
export default function LandingPage({
  onFiles,
  rejected,
}: {
  onFiles: (files: File[]) => void
  /** Names of files the sorter turned away — this page has to carry them, because
      an all-rejected drop leaves the queue empty and never reaches AllStudio. */
  rejected: string[]
}) {
  // `pageWide`: the ring is where to aim, not where you have to land. A file
  // dropped on the headline or in the margin is sorted just the same — and
  // without it the browser navigates away to the file it was handed.
  const drop = useFileDrop({
    onFiles,
    accept: ALL_ACCEPT,
    label: 'Drop any file here, or click to browse',
    pageWide: true,
  })

  return (
    <div className={`${CONTAINER} flex flex-col gap-4 py-5 lg:py-10`}>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        {/* Desktop keeps the illustration as its own column. On a phone it is
            hidden rather than stacked: as a block above or below it is a full
            screen-height of scrolling on either side of the primary action,
            which is what stops a landing page fitting on one screen. */}
        <div className="order-2 hidden min-w-0 flex-col items-center gap-4 lg:order-1 lg:flex lg:items-start">
          <ConverterIllustration />
        </div>

        {/* ⚠️ min-w-0 is load-bearing, not tidying. A grid item defaults to
            `min-width: auto`, so its min-content width becomes a floor the
            track cannot go below — one long unbreakable word would otherwise
            lay the whole column out wider than the phone. */}
        <div className="order-1 min-w-0 lg:order-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            Any file, <span className="text-orange-600">any format</span>.
          </h1>
          <p className="mt-3 max-w-md text-slate-600">
            Drop a mixed pile and each file finds the tab that can convert it — no size limit,
            and no queue to wait in.
          </p>

          <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            {/* The suite's shared drop circle (`DropRing` + `useFileDrop` from
                @unisim/sdk) rather than a copy, so this is the same front door
                Universal Compress, PDF and Images open on. Always `idle` —
                nothing converts on this page, and a busy chase on an empty page
                reads as "still loading". */}
            <div className="flex flex-col items-center">
              <div
                {...drop.dropzoneProps}
                className={`relative w-full max-w-[280px] cursor-pointer rounded-full transition-transform focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600 ${
                  drop.over ? 'scale-[1.02]' : ''
                }`}
              >
                <DropRing size="100%" over={drop.over} motion="idle" watermark={<AnyFileWatermark />}>
                  <svg
                    viewBox="0 0 24 24"
                    className={`mb-1 h-9 w-9 ${drop.over ? 'text-orange-500' : 'text-slate-400'}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {/* One thing coming in, splitting two ways — sorting. The
                        same glyph the All tab's own circle wears, because it is
                        the same circle doing the same job. */}
                    <path d="M12 3v6" />
                    <path d="M12 9c0 3-6 2-6 6" />
                    <path d="M12 9c0 3 6 2 6 6" />
                    <path d="M3.5 18 6 21l2.5-3" />
                    <path d="M15.5 18 18 21l2.5-3" />
                  </svg>
                  <span className="text-[15px] font-bold text-slate-900">
                    {drop.over ? 'Drop to sort' : 'Drop any file here'}
                  </span>
                  <span className="text-[11.5px] leading-relaxed text-slate-500">
                    Pictures · Audio · Video · Documents
                  </span>
                  <span className="mt-1 text-[11px] text-slate-400">or click to browse</span>
                </DropRing>
              </div>
              <input {...drop.inputProps} className="hidden" />
            </div>

            {rejected.length > 0 && (
              // Named individually rather than counted. "3 files skipped" makes
              // you go and work out which three, and the whole point of a mixed
              // drop is that you were not looking closely in the first place.
              <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-amber-900">
                <span className="font-semibold">Not converted:</span> {rejected.join(', ')} — not a
                picture, a sound, a video or a document this can read.
              </p>
            )}

            <div className="mt-5 flex items-center gap-3 text-xs text-slate-500">
              <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
              <span>what it takes</span>
              <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
            </div>

            {/* The quick answer, in six lines. The exhaustive one is a click
                away below: spelling out four extension lists here made the card
                twice the height of the drop circle, and a landing page that
                does not fit on one screen has buried its own primary action. */}
            <ul className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <li className="flex items-center gap-2"><span className="text-orange-700">✓</span> PNG, JPEG, WebP, AVIF</li>
              <li className="flex items-center gap-2"><span className="text-orange-700">✓</span> MP3, M4A, Opus, FLAC</li>
              <li className="flex items-center gap-2"><span className="text-orange-700">✓</span> MP4, M4V, MOV</li>
              <li className="flex items-center gap-2"><span className="text-orange-700">✓</span> Word, ODT, RTF → PDF</li>
              <li className="flex items-center gap-2"><span className="text-orange-700">✓</span> Trim, resize &amp; compress</li>
              <li className="flex items-center gap-2"><span className="text-orange-700">✓</span> Mixed drops, one queue</li>
            </ul>

            {/* This is the sorting column's old "What this will take" card,
                moved rather than rewritten — it is a first-visit answer, and it
                was being shown in the one place you only reach after the
                question has already been settled by dropping something.

                Still built from the real extension lists rather than typed out
                again, so the card cannot drift from what the app actually
                accepts. */}
            <details className="group mt-4">
              <summary className="flex cursor-pointer list-none select-none items-center gap-2 text-[12px] font-semibold text-slate-600 hover:text-slate-900">
                <span className="text-slate-400 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
                Every format it reads — and the four it won't
              </summary>
              <ul className="mt-3 flex flex-col gap-2">
                <Capability label="Images" body={`${list(IMAGE_INPUT_EXTS)} — convert between PNG, JPEG, WebP and AVIF, and resize.`} />
                {/* ⚠️ MP4 is deliberately NOT listed here even though the audio
                    tab accepts it. `kindOf` sends an .mp4 to the VIDEO tab, so
                    listing it under Audio would promise a destination the sorter
                    does not use. Taking the sound out of a video is on the video
                    tab, under Other exports. */}
                <Capability label="Audio" body={`${list(AUDIO_INPUT_EXTS, ['mp4'])} — convert to MP3, M4A, Opus, FLAC, WAV or AIFF.`} />
                <Capability label="Video" body={`${list(VIDEO_INPUT_EXTS)} — trim, resize and compress to H.264 MP4, or turn into an animated GIF.`} />
                <Capability label="Files" body={`${list(DOCUMENT_INPUT_EXTS, ['text', 'log', 'htm', 'markdown', 'tsv'])} — convert to a laid-out PDF, or to text, HTML, Markdown, CSV and JSON.`} />
              </ul>

              {/* Named here rather than discovered on drop: these are the ones
                  everybody tries, and finding out after you have dragged a 2 GB
                  file across is the worst moment to be told. */}
              <p className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
                <span className="font-semibold text-slate-700">Not MKV or AVI.</span> Those
                containers need a different engine than the one that runs in a browser tab, so they
                are refused on drop rather than accepted and failed halfway through.
              </p>
              <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
                <span className="font-semibold text-slate-700">Not XLSX or PPTX.</span> Save a
                spreadsheet as CSV and it converts; export a slide deck to PDF from the app that
                made it. And PDF is what the Files tab converts <em>to</em> — to edit or split one,
                use{' '}
                <a
                  href="https://opensource.unisim.co.uk/pdf"
                  className="font-semibold text-orange-700 underline decoration-orange-300 underline-offset-2 hover:text-orange-800"
                >
                  Universal PDF
                </a>.
              </p>
            </details>
          </div>

          {/* Under the card, the suite's placement. It sat above the fold until
              2026-08-28; the same move on Universal Compress was forced by its
              illustration animating over the note, and both pages now agree. */}
          <PrivacyNote
            className="mt-4"
            repo="https://github.com/universal-simulation-ltd/Universal_Converter"
            subject="Your files"
            plural
          />
        </div>
      </div>

      {/* The other half of `pageWide` — the circle lights up wherever the drag
          is, and this says why, in the margin where the pointer actually is. */}
      <DropAnywhere
        show={drop.pageOver}
        hint="Pictures, audio, video and documents — each finds its own tab"
      />
    </div>
  )
}

function Capability({ label, body }: { label: string; body: string }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-14 shrink-0 items-center justify-center rounded bg-slate-100 text-[9.5px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="text-[11.5px] leading-relaxed text-slate-600">{body}</span>
    </li>
  )
}

/**
 * Built from the real extension lists rather than typed out again, so the card
 * cannot drift from what the app actually accepts. `.qt` is dropped as a
 * synonym nobody types, and `.jpeg`/`.oga`/`.weba` likewise.
 */
function list(exts: readonly string[], also: readonly string[] = []): string {
  const skip = new Set(['jpeg', 'qt', 'oga', 'weba', 'heif', ...also])
  return exts.filter((e) => !skip.has(e)).map((e) => e.toUpperCase()).join(', ')
}
