import { useEffect, useState } from 'react'
import { AUDIO_ACCEPT, AUDIO_FORMATS, audioFormatMeta, audioFormatSupported } from '../../lib/formats'
import { formatDuration, parseClock } from '../../lib/humanise'
import { aacSupported } from '../../lib/aac'
import { MP3_BITRATES } from '../../lib/mp3'
import { useConverterStore } from '../../stores/converterStore'
import StudioShell from './StudioShell'
import { Divider, Field, FormatChip, Panel, PanelActions, Segmented, Select, Toggle } from './PanelParts'
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

  // Opus rides on WebCodecs, which not every browser implements, so support is
  // probed rather than assumed — the same treatment AVIF gets on the images tab.
  const [supported, setSupported] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(AUDIO_FORMATS.map((f) => [f.id, f.engine !== 'ffmpeg' && f.id !== 'opus'])),
  )

  useEffect(() => {
    let live = true
    void Promise.all(
      AUDIO_FORMATS.map(async (f) => [f.id, await audioFormatSupported(f.id)] as const),
    ).then((pairs) => {
      if (live) setSupported(Object.fromEntries(pairs) as Record<AudioFormat, boolean>)
    })
    return () => {
      live = false
    }
  }, [])

  // Chrome's AAC encoder refuses some bitrates outright while still reporting
  // them as supported, so each one offered here is trial-encoded and struck
  // through if it fails. Only M4A needs this.
  const [badBitrates, setBadBitrates] = useState<number[]>([])
  useEffect(() => {
    if (settings.format !== 'm4a') {
      setBadBitrates([])
      return
    }
    let live = true
    void Promise.all(
      MP3_BITRATES.map(async (b) => [b, await aacSupported(b, 2)] as const),
    ).then((pairs) => {
      if (live) setBadBitrates(pairs.filter(([, ok]) => !ok).map(([b]) => b))
    })
    return () => {
      live = false
    }
  }, [settings.format])

  const target = audioFormatMeta(settings.format)
  const engineReady = supported[settings.format] === true

  return (
    <Panel>
      <Field label="Convert to">
        <div className="flex flex-wrap gap-1.5">
          {AUDIO_FORMATS.map((f) => (
            <FormatChip
              key={f.id}
              label={f.label}
              selected={settings.format === f.id}
              ready={supported[f.id] === true}
              disabled={running}
              title={
                supported[f.id]
                  ? undefined
                  : f.engine === 'ffmpeg'
                    ? `${f.label} needs the ffmpeg engine (not wired up yet)`
                    : `This browser can’t encode ${f.label}`
              }
              onSelect={() => update({ format: f.id })}
            />
          ))}
        </div>
        <p className="text-[11px] text-slate-500">{target.blurb}</p>
        {!engineReady && (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-800">
            {target.engine === 'ffmpeg'
              ? `${target.label} needs the ffmpeg engine, which isn’t wired up yet.`
              : `This browser can’t encode ${target.label}.`}{' '}
            MP3, WAV and AIFF convert everywhere.
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
            unavailable={badBitrates}
            unavailableTitle="This browser’s AAC encoder refuses this bitrate"
          />
          <p className="text-[10.5px] text-slate-400">
            {badBitrates.includes(settings.bitrateKbps)
              ? 'This browser’s AAC encoder refuses this bitrate — pick another.'
              : 'kbps, constant. 192 is transparent for most music; 320 is as good as it gets.'}
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

      <Toggle
        label="Trim"
        hint="Keep only part of each file — same window for the whole queue"
        on={settings.trim.enabled}
        disabled={running}
        onChange={(enabled) => update({ trim: { ...settings.trim, enabled } })}
      />

      {settings.trim.enabled && <TrimFields />}

      <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
        Tag-copying arrives with the ffmpeg engine.
      </p>

      <Divider />

      <PanelActions kind="audio" canConvert={engineReady} />
    </Panel>
  )
}

// Start/end as free text so "1:30" is as valid as "90". The parse is deliberately
// strict: an unparseable field says so and holds the last good value, rather than
// silently trimming from zero.
function TrimFields() {
  const trim = useConverterStore((s) => s.audio.trim)
  const running = useConverterStore((s) => s.running)
  const update = useConverterStore((s) => s.updateAudio)

  const [startText, setStartText] = useState(trim.startSec ? formatDuration(trim.startSec) : '0:00')
  const [endText, setEndText] = useState(trim.endSec == null ? '' : formatDuration(trim.endSec))

  const startBad = startText.trim() !== '' && parseClock(startText) === null
  const endBad = endText.trim() !== '' && parseClock(endText) === null

  function commitStart(text: string) {
    setStartText(text)
    const seconds = text.trim() === '' ? 0 : parseClock(text)
    if (seconds !== null) update({ trim: { ...trim, startSec: seconds } })
  }

  function commitEnd(text: string) {
    setEndText(text)
    if (text.trim() === '') {
      update({ trim: { ...trim, endSec: null } })
      return
    }
    const seconds = parseClock(text)
    if (seconds !== null) update({ trim: { ...trim, endSec: seconds } })
  }

  const field =
    'w-full rounded-lg border px-3 py-2 text-[12px] tabular-nums focus:outline-none focus-visible:outline-2 focus-visible:outline-orange-600 disabled:opacity-50'

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">Start</span>
          <input
            value={startText}
            disabled={running}
            onChange={(e) => commitStart(e.target.value)}
            placeholder="0:00"
            inputMode="numeric"
            aria-invalid={startBad}
            className={`${field} ${startBad ? 'border-red-400 text-red-700' : 'border-slate-200 bg-white text-slate-900'}`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">End</span>
          <input
            value={endText}
            disabled={running}
            onChange={(e) => commitEnd(e.target.value)}
            placeholder="end of file"
            inputMode="numeric"
            aria-invalid={endBad}
            className={`${field} ${endBad ? 'border-red-400 text-red-700' : 'border-slate-200 bg-white text-slate-900'}`}
          />
        </label>
      </div>
      <p className={`text-[10.5px] ${startBad || endBad ? 'text-red-700' : 'text-slate-400'}`}>
        {startBad || endBad
          ? 'Use mm:ss, h:mm:ss, or a number of seconds.'
          : 'mm:ss, h:mm:ss or seconds. Leave End blank to run to the end of each file.'}
      </p>
    </div>
  )
}
