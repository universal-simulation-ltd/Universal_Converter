import { FORMATS, formatMeta } from '../../lib/formats'
import { useConverterStore } from '../../stores/converterStore'
import type { AudioFormat, ChannelMode, SampleRate } from '../../lib/types'

const SAMPLE_RATES: { value: SampleRate; label: string }[] = [
  { value: 'source', label: 'Keep original' },
  { value: 48000, label: '48 kHz' },
  { value: 44100, label: '44.1 kHz' },
  { value: 22050, label: '22.05 kHz' },
]

const CHANNELS: { value: ChannelMode; label: string }[] = [
  { value: 'source', label: 'Keep' },
  { value: 'stereo', label: 'Stereo' },
  { value: 'mono', label: 'Mono' },
]

export default function OutputPanel() {
  const settings = useConverterStore((s) => s.settings)
  const items = useConverterStore((s) => s.items)
  const running = useConverterStore((s) => s.running)
  const update = useConverterStore((s) => s.updateSettings)
  const convertAll = useConverterStore((s) => s.convertAll)
  const downloadAll = useConverterStore((s) => s.downloadAll)

  const target = formatMeta(settings.format)
  const engineReady = target.engine === 'web-audio'
  const pending = items.filter((i) => i.status === 'queued' || i.status === 'failed').length
  const doneCount = items.filter((i) => i.result).length
  const canConvert = engineReady && pending > 0 && !running

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-3">
        <span className="text-[12.5px] font-bold text-slate-900">Output</span>
        <span className="ml-auto font-mono text-[11px] text-slate-400">applies to all</span>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <Field label="Convert to">
          <div className="flex flex-wrap gap-1.5">
            {FORMATS.map((f) => (
              <FormatChip
                key={f.id}
                id={f.id}
                label={f.label}
                selected={settings.format === f.id}
                ready={f.engine === 'web-audio'}
                disabled={running}
                onSelect={() => update({ format: f.id })}
              />
            ))}
          </div>
          <p className="text-[11px] text-slate-500">{target.blurb}</p>
          {!engineReady && (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-800">
              {target.label} output needs the conversion engine, which isn’t wired up yet. WAV
              converts today using the browser’s own decoder.
            </p>
          )}
        </Field>

        <Field label="Sample rate">
          <select
            value={String(settings.sampleRate)}
            disabled={running}
            onChange={(e) =>
              update({
                sampleRate: e.target.value === 'source' ? 'source' : (Number(e.target.value) as SampleRate),
              })
            }
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-900 tabular-nums focus:outline-none focus-visible:outline-2 focus-visible:outline-orange-600 disabled:opacity-50"
          >
            {SAMPLE_RATES.map((r) => (
              <option key={String(r.value)} value={String(r.value)}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Channels">
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            {CHANNELS.map((c) => (
              <button
                key={c.value}
                type="button"
                disabled={running}
                onClick={() => update({ channels: c.value })}
                className={`flex-1 py-1.5 text-[11.5px] font-semibold transition-colors disabled:opacity-50 ${
                  settings.channels === c.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="h-px bg-slate-200" />

        <Toggle
          label="Normalise loudness"
          hint="Lift the whole file so its loudest peak sits just under full scale"
          on={settings.normalise}
          disabled={running}
          onChange={(v) => update({ normalise: v })}
        />

        <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
          Bitrate, trim and tag-copying arrive with the MP3 / M4A engine — they don’t apply to the
          uncompressed targets available today.
        </p>

        <div className="h-px bg-slate-200" />

        <button
          type="button"
          disabled={!canConvert}
          onClick={() => void convertAll()}
          className="w-full rounded-xl bg-gradient-to-br from-[#FE8C01] to-[#E05504] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-opacity hover:opacity-95 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? 'Converting…' : pending === 1 ? 'Convert 1 file' : `Convert ${pending} files`}
        </button>

        <button
          type="button"
          disabled={doneCount === 0 || running}
          onClick={() => void downloadAll()}
          className="w-full rounded-xl bg-orange-500/12 px-4 py-2.5 text-[13px] font-bold text-orange-800 transition-colors hover:bg-orange-500/20 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Download all as ZIP
        </button>

        <p className="text-center text-[10.5px] text-slate-400">
          Converted files are saved straight to your downloads.
        </p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-slate-600">{label}</span>
      {children}
    </div>
  )
}

function FormatChip({
  id,
  label,
  selected,
  ready,
  disabled,
  onSelect,
}: {
  id: AudioFormat
  label: string
  selected: boolean
  ready: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <button
      key={id}
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      title={ready ? undefined : `${label} needs the conversion engine (not wired up yet)`}
      className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-orange-600 disabled:opacity-50 ${
        selected
          ? 'bg-gradient-to-br from-[#FE8C01] to-[#E05504] font-bold text-white'
          : ready
            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            : 'bg-slate-100 text-slate-400'
      }`}
    >
      {label}
      {!ready && <span className="ml-1 align-middle text-[9px]">•</span>}
    </button>
  )
}

function Toggle({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  on: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 text-left focus:outline-none focus-visible:outline-2 focus-visible:outline-orange-600 disabled:opacity-50"
    >
      <span>
        <span className="block text-[12px] font-semibold text-slate-900">{label}</span>
        <span className="block text-[10.5px] text-slate-400">{hint}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          on ? 'bg-gradient-to-br from-[#FE8C01] to-[#E05504]' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${on ? 'left-4.5' : 'left-0.5'}`}
        />
      </span>
    </button>
  )
}
