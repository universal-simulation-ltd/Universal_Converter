import { useState } from 'react'
import { convertAudio } from '../../lib/convert'
import { saveBlob } from '../../lib/download'
import { buildPdf, imageToJpeg } from '../../lib/pdf'
import { useConverterStore } from '../../stores/converterStore'
import type { AudioFormat, MediaKind } from '../../lib/types'

/**
 * Other exports — the conversions that cross from one kind of media to another.
 *
 * They live in their own card, below the panel and visibly separate from it,
 * because they are a different promise. Everything in the panel above keeps the
 * thing you dropped and changes its format; everything here THROWS SOMETHING
 * AWAY. Taking the audio out of a video loses the picture. Putting pictures in a
 * PDF loses transparency and re-encodes them. Neither is a surprise if it is
 * said before you press the button, and both are a nasty one if it is not — so
 * the cost is written next to each, in the sentence, not behind a tooltip.
 *
 * These deliberately do NOT go through the queue. `QueueItem.result` is a single
 * slot, so a second output per item would mean either a second slot or cloned
 * rows, and both make the queue mean two different things. Here the export is a
 * one-shot: press it, it runs, it downloads.
 */
export default function OtherExports({ kind }: { kind: MediaKind }) {
  if (kind === 'image') return <ImagesToPdf />
  if (kind === 'video') return <VideoToAudio />
  if (kind === 'document') return <DocumentsToOnePdf />
  // The audio tab has nowhere to cross TO. A card saying "nothing here" is
  // worse than no card.
  return null
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Other exports</h2>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
        These change what the file <em>is</em>, not just its format — so each one loses something.
        What, is written below.
      </p>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function ImagesToPdf() {
  const items = useConverterStore((s) => s.items)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const pictures = items.filter((i) => i.kind === 'image' && i.status !== 'unsupported')

  async function run() {
    setBusy(true)
    setError(null)
    setDone(0)
    try {
      const pages = []
      for (const item of pictures) {
        // 0.82 and a 2000px cap: a photo page nobody will print at more than
        // A4 gains nothing from 4000px, and a 40-page PDF of full-resolution
        // JPEGs is a file you cannot email.
        pages.push(await imageToJpeg(item.file, 0.82, 2000))
        setDone((n) => n + 1)
      }
      saveBlob(buildPdf(pages, 'Universal Converter'), 'pictures.pdf')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <p className="text-xs text-slate-700">
        <span className="font-semibold text-slate-900">Save as one PDF</span> — every picture in the
        queue becomes a page, in the order they are listed.
      </p>
      <ul className="mt-2 space-y-1 text-[11px] leading-snug text-slate-500">
        <li>• Pages are JPEG, so this is <span className="font-medium">lossy</span> — a screenshot
          of text will soften slightly.</li>
        <li>• <span className="font-medium">Transparency is flattened onto white</span>, because
          JPEG has no transparency.</li>
        <li>• Long edges are capped at 2000px to keep the file sendable.</li>
        <li>• It is a picture in a PDF, not a document — there is no selectable text.</li>
      </ul>

      <button
        type="button"
        disabled={busy || pictures.length === 0}
        onClick={run}
        className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      >
        {busy
          ? `Building… ${done}/${pictures.length}`
          : pictures.length === 0
            ? 'Add some pictures first'
            : `Save ${pictures.length} picture${pictures.length === 1 ? '' : 's'} as a PDF`}
      </button>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </Shell>
  )
}

/**
 * Every queued document as ONE PDF, in queue order.
 *
 * The cross-kind export for the Files tab, and the same idea as pictures →
 * one PDF above: several files in, one file out. What it throws away is the
 * separateness — the documents' own names, and any chance of getting them back
 * apart — which is why it lives here rather than in the panel.
 *
 * It reuses the ordinary pipeline rather than a second one: each file is read
 * to a RichDoc, the docs are concatenated with a page break between them, and
 * the result goes through the same writer with the same settings. A separate
 * "merge" path would be a second layout engine to keep in step with this one.
 */
function DocumentsToOnePdf() {
  const items = useConverterStore((s) => s.items)
  const settings = useConverterStore((s) => s.document)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])

  const documents = items.filter((i) => i.kind === 'document' && i.status !== 'unsupported')

  async function run() {
    setBusy(true)
    setError(null)
    setNotes([])
    setDone(0)
    try {
      const { readForMerge, mergeToPdf } = await import('../../lib/doc')
      const parts = []
      for (const item of documents) {
        parts.push(await readForMerge(item.file))
        setDone((n) => n + 1)
      }
      const result = await mergeToPdf(parts, settings.pdf)
      saveBlob(result.blob, 'documents.pdf')
      setNotes(result.notices.map((n) => n.message))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <p className="text-xs text-slate-700">
        <span className="font-semibold text-slate-900">Join into one PDF</span> — every document in
        the queue, one after another, in the order they are listed.
      </p>
      <ul className="mt-2 space-y-1 text-[11px] leading-snug text-slate-500">
        <li>• Each document starts on a <span className="font-medium">new page</span>, with its
          filename as a heading so you can still tell them apart.</li>
        <li>• The result is <span className="font-medium">one file</span>. There is no way to get
          the separate documents back out of it here.</li>
        <li>• It uses the page, font and margin settings from the panel above.</li>
      </ul>

      <button
        type="button"
        disabled={busy || documents.length < 1}
        onClick={() => void run()}
        className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      >
        {busy
          ? `Reading… ${done}/${documents.length}`
          : documents.length === 0
            ? 'Add some documents first'
            : `Join ${documents.length} document${documents.length === 1 ? '' : 's'} into one PDF`}
      </button>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {notes.map((note) => (
        <p
          key={note}
          className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900"
        >
          {note}
        </p>
      ))}
    </Shell>
  )
}

/** Formats worth offering for a soundtrack. The full list lives on the Audio tab. */
const SOUNDTRACK_FORMATS: { id: AudioFormat; label: string; note: string }[] = [
  { id: 'mp3', label: 'MP3', note: 'plays anywhere' },
  { id: 'm4a', label: 'M4A', note: 'smaller, same quality' },
  { id: 'wav', label: 'WAV', note: 'uncompressed, large' },
]

function VideoToAudio() {
  const items = useConverterStore((s) => s.items)
  const audio = useConverterStore((s) => s.audio)
  const [format, setFormat] = useState<AudioFormat>('mp3')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const videos = items.filter((i) => i.kind === 'video' && i.status !== 'unsupported')

  async function run(id: string, file: File, name: string) {
    setBusyId(id)
    setError(null)
    try {
      // The existing audio pipeline, unchanged: `decodeAudioData` reads an
      // MP4's audio track directly, which is why extracting a soundtrack needs
      // no demuxer and no second engine.
      const result = await convertAudio(file, { ...audio, format })
      saveBlob(result.blob, result.name)
    } catch {
      // The overwhelmingly likely cause, and the one worth naming: plenty of
      // phone and screen-recording clips genuinely have no audio track, and
      // "conversion failed" would send somebody hunting for a bug.
      setError(`Could not get any audio out of ${name}. It may not have a soundtrack at all.`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Shell>
      <p className="text-xs text-slate-700">
        <span className="font-semibold text-slate-900">Save the sound only</span> — takes the
        soundtrack out of a video.
      </p>
      <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900">
        <span className="font-semibold">There is no video in the result.</span> You get an audio
        file and nothing else. To keep the picture, use the panel above instead.
      </p>

      <div className="mt-3">
        <span className="mb-1 block text-[11px] font-medium text-slate-600">Save the sound as</span>
        <div className="flex flex-wrap gap-1.5">
          {SOUNDTRACK_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormat(f.id)}
              aria-pressed={f.id === format}
              className={`rounded-md border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                f.id === format
                  ? 'border-orange-500 bg-orange-50 text-orange-900'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="block font-semibold">{f.label}</span>
              <span className="block text-slate-500">{f.note}</span>
            </button>
          ))}
        </div>
      </div>

      {videos.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">Add a video and it will appear here.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {videos.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void run(item.id, item.file, item.file.name)}
                className="w-full truncate rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {busyId === item.id ? 'Working…' : `Sound from ${item.file.name}`}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </Shell>
  )
}
