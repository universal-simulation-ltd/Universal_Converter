import { commonTargets, type DocFormat, type FontChoice, type PageMargin, type PaperSize } from '../../lib/doc'
import { useConverterStore } from '../../stores/converterStore'
import OtherExports from './OtherExports'
import StudioActions from './StudioActions'
import StudioShell from './StudioShell'
import { Collapsible, Divider, Field, FormatChip, Panel, Segmented, Select } from './PanelParts'

/**
 * The Files studio — documents in, PDF (or text, HTML, Markdown, CSV, JSON) out.
 *
 * The fourth tab, and the one that breaks the pattern the other three share:
 * audio, images and video each convert WITHIN a kind, and this one converts
 * BETWEEN them. A .docx and a .csv are not the same sort of thing at all, and
 * the panel says so — the format chips on offer change with what is in the
 * queue, because CSV and JSON are only reachable from a file that has rows in
 * it, and offering them for a Word document would be a promise the pipeline
 * cannot keep. See `targetsFor` in `lib/doc`.
 */

const TARGETS: { id: DocFormat; label: string; blurb: string }[] = [
  { id: 'pdf', label: 'PDF', blurb: 'A laid-out document with selectable text, real page breaks and working links.' },
  { id: 'txt', label: 'Text', blurb: 'The words and nothing else. Headings are underlined so they still read as headings.' },
  { id: 'html', label: 'HTML', blurb: 'A complete web page you can open — styled, responsive, and dark-mode aware.' },
  { id: 'md', label: 'Markdown', blurb: 'Headings, emphasis, lists and tables as markup. Good for a wiki or a repo.' },
  { id: 'csv', label: 'CSV', blurb: 'Rows and columns for a spreadsheet. Only from a file that already has them.' },
  { id: 'json', label: 'JSON', blurb: 'One object per row, keyed by column name. Only from a file that has rows.' },
]

const PAPERS: { value: PaperSize; label: string }[] = [
  { value: 'A4', label: 'A4 (210 × 297 mm)' },
  { value: 'Letter', label: 'US Letter (8.5 × 11 in)' },
  { value: 'A5', label: 'A5 (148 × 210 mm)' },
  { value: 'A3', label: 'A3 (297 × 420 mm)' },
]

const FONTS: { value: FontChoice; label: string }[] = [
  { value: 'sans', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
]

const MARGINS: { value: PageMargin; label: string }[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'normal', label: 'Normal' },
  { value: 'wide', label: 'Wide' },
]

const SIZES: { value: number; label: string }[] = [
  { value: 9.5, label: 'Small' },
  { value: 11, label: 'Normal' },
  { value: 13, label: 'Large' },
]

export default function DocumentStudio() {
  const format = useConverterStore((s) => s.document.format)
  const target = TARGETS.find((t) => t.id === format) ?? TARGETS[0]

  return (
    <StudioShell
      kind="document"
      targetExt={target.id === 'md' ? 'md' : target.id}
      panel={
        <div className="flex flex-col gap-4">
          <DocumentPanel />
          <OtherExports kind="document" />
        </div>
      }
    />
  )
}

function DocumentPanel() {
  const settings = useConverterStore((s) => s.document)
  const running = useConverterStore((s) => s.running)
  const update = useConverterStore((s) => s.updateDocument)
  const items = useConverterStore((s) => s.items)

  // Which targets EVERY queued file can reach. A queue of one CSV can become
  // JSON; add a Word file to it and that stops being true, so the chip goes
  // unavailable rather than failing on one row halfway down the batch.
  const queued = items.filter((i) => i.kind === 'document' && i.status !== 'unsupported')
  const available = commonTargets(queued.map((i) => i.ext))
  const target = TARGETS.find((t) => t.id === settings.format) ?? TARGETS[0]
  const ready = available.includes(settings.format)

  return (
    <>
      <Panel>
        <Field label="Convert to">
          <div className="flex flex-wrap gap-1.5">
            {TARGETS.map((t) => (
              <FormatChip
                key={t.id}
                label={t.label}
                selected={settings.format === t.id}
                ready={available.includes(t.id)}
                disabled={running}
                title={
                  available.includes(t.id)
                    ? undefined
                    : queued.length
                      ? `${t.label} needs a file with rows in it — a CSV or JSON`
                      : undefined
                }
                onSelect={() => update({ format: t.id })}
              />
            ))}
          </div>
          <p className="text-[11px] text-slate-500">{target.blurb}</p>
          {!ready && queued.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-800">
              {target.label} needs rows and columns to start from. It’s available for a CSV or a JSON
              file — a document has paragraphs, not cells.
            </p>
          )}
        </Field>

        {settings.format === 'pdf' && (
          <>
            <Field label="Page">
              <Select
                options={PAPERS}
                value={settings.pdf.paper}
                disabled={running}
                onChange={(paper) => update({ pdf: { ...settings.pdf, paper } })}
              />
            </Field>

            <Field label="Text">
              <Segmented
                options={FONTS}
                value={settings.pdf.font}
                disabled={running}
                onChange={(font) => update({ pdf: { ...settings.pdf, font } })}
              />
              <Segmented
                options={SIZES}
                value={nearestSize(settings.pdf.fontSize)}
                disabled={running}
                onChange={(fontSize) => update({ pdf: { ...settings.pdf, fontSize } })}
              />
              <p className="text-[10.5px] text-slate-400">
                Headings, code and tables all scale from the body size, so one setting sets the lot.
              </p>
            </Field>

            <Collapsible
              label="More"
              summary={`${settings.pdf.margin} margins · ${settings.pdf.pageNumbers ? 'numbered' : 'no numbers'}`}
            >
              <Field label="Margins">
                <Segmented
                  options={MARGINS}
                  value={settings.pdf.margin}
                  disabled={running}
                  onChange={(margin) => update({ pdf: { ...settings.pdf, margin } })}
                />
              </Field>
              <Field label="Page numbers">
                <Segmented
                  options={[
                    { value: 'on' as const, label: 'Show' },
                    { value: 'off' as const, label: 'Hide' },
                  ]}
                  value={settings.pdf.pageNumbers ? 'on' : 'off'}
                  disabled={running}
                  onChange={(v) => update({ pdf: { ...settings.pdf, pageNumbers: v === 'on' } })}
                />
                <p className="text-[10.5px] text-slate-400">
                  Only drawn when there is more than one page.
                </p>
              </Field>
            </Collapsible>

            <Divider />

            <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
              The PDF uses the fonts every reader already has, so nothing is embedded and the file
              stays small. That means <span className="font-medium text-slate-700">Latin alphabets
              only</span> — Greek, Cyrillic, Hebrew, Arabic and CJK can’t be written, and any that
              appear are named on the row afterwards rather than silently replaced.
            </p>
          </>
        )}

        {settings.format === 'json' && (
          <Field label="Values">
            <Segmented
              options={[
                { value: 'typed' as const, label: 'Numbers & true/false' },
                { value: 'text' as const, label: 'All text' },
              ]}
              value={settings.inferTypes ? 'typed' : 'text'}
              disabled={running}
              onChange={(v) => update({ inferTypes: v === 'typed' })}
            />
            <p className="text-[10.5px] leading-relaxed text-slate-400">
              Typed reads <code className="font-mono">42</code> as a number. A value that wouldn’t
              survive the trip stays text either way — <code className="font-mono">007</code> keeps
              its zeros, and a phone number keeps its <code className="font-mono">+</code>.
            </p>
          </Field>
        )}

        {(settings.format === 'txt' || settings.format === 'md' || settings.format === 'html') && (
          <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
            Pictures inside a document can’t travel into a {target.label} file, so each one is marked
            in place by its caption. Everything else — headings, emphasis, lists, tables and links —
            comes across.
          </p>
        )}
      </Panel>

      <StudioActions kind="document" canConvert={ready} />
    </>
  )
}

/** The stored size is a number so it can be anything; the control snaps. */
function nearestSize(size: number): number {
  return SIZES.reduce((best, o) => (Math.abs(o.value - size) < Math.abs(best.value - size) ? o : best)).value
}
