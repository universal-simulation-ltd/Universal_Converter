import { AUDIO_ACCEPT, AUDIO_FORMATS, audioFormatMeta } from '../../lib/formats'
import { MP3_BITRATES } from '../../lib/mp3'
import { useConverterStore } from '../../stores/converterStore'
import StudioShell from './StudioShell'
import { Divider, Field, FormatChip, Panel, PanelActions, Segmented, Select, Toggle } from './PanelParts'
import type { ChannelMode, SampleRate } from '../../lib/types'

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

export default function AudioStudio() {
  const settings = useConverterStore((s) => s.audio)
  const target = audioFormatMeta(settings.format)

  return (
    <StudioShell
      kind="audio"
      accept={AUDIO_ACCEPT}
      emptyTitle="Drop audio here to convert it"
      moreTitle="Drop more audio here"
      formatsLine="WAV, MP3, M4A/AAC, FLAC, OGG, Opus, AIFF, WebM — or click to browse"
      engineBadge="on-device encoder · works offline"
      targetExt={target.ext}
      panel={<AudioPanel />}
    />
  )
}

function AudioPanel() {
  const settings = useConverterStore((s) => s.audio)
  const running = useConverterStore((s) => s.running)
  const update = useConverterStore((s) => s.updateAudio)

  const target = audioFormatMeta(settings.format)
  const engineReady = target.engine !== 'ffmpeg'

  return (
    <Panel>
      <Field label="Convert to">
        <div className="flex flex-wrap gap-1.5">
          {AUDIO_FORMATS.map((f) => (
            <FormatChip
              key={f.id}
              label={f.label}
              selected={settings.format === f.id}
              ready={f.engine !== 'ffmpeg'}
              disabled={running}
              title={f.engine === 'ffmpeg' ? `${f.label} needs the ffmpeg engine (not wired up yet)` : undefined}
              onSelect={() => update({ format: f.id })}
            />
          ))}
        </div>
        <p className="text-[11px] text-slate-500">{target.blurb}</p>
        {!engineReady && (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-800">
            {target.label} needs the ffmpeg engine, which isn’t wired up yet. MP3, WAV and AIFF all
            convert today.
          </p>
        )}
      </Field>

      {target.lossy && (
        <Field label="Bitrate">
          <Segmented
            options={MP3_BITRATES.map((b) => ({ value: b, label: `${b}` }))}
            value={settings.bitrateKbps}
            disabled={running || !engineReady}
            onChange={(bitrateKbps) => update({ bitrateKbps })}
          />
          <p className="text-[10.5px] text-slate-400">
            kbps, constant. 192 is transparent for most music; 320 is as good as MP3 gets.
          </p>
        </Field>
      )}

      <Field label="Sample rate">
        <Select
          options={SAMPLE_RATES}
          value={settings.sampleRate}
          disabled={running}
          onChange={(sampleRate) => update({ sampleRate })}
        />
      </Field>

      <Field label="Channels">
        <Segmented
          options={CHANNELS}
          value={settings.channels}
          disabled={running}
          onChange={(channels) => update({ channels })}
        />
      </Field>

      <Divider />

      <Toggle
        label="Normalise loudness"
        hint="Lift the whole file so its loudest peak sits just under full scale"
        on={settings.normalise}
        disabled={running}
        onChange={(normalise) => update({ normalise })}
      />

      <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
        Trim and tag-copying arrive with the ffmpeg engine.
      </p>

      <Divider />

      <PanelActions kind="audio" canConvert={engineReady} />
    </Panel>
  )
}
