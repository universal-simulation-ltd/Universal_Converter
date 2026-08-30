import { useEffect, useState } from 'react'
import { AUDIO_FORMATS, audioFormatMeta, audioFormatSupported } from '../../lib/formats'
import { formatDuration, parseClock } from '../../lib/humanise'
import { aacSupported } from '@unisim/media'
import { MP3_BITRATES } from '../../lib/mp3'
import { useConverterStore } from '../../stores/converterStore'
import StudioActions from './StudioActions'
import StudioShell from './StudioShell'
import { Collapsible, Divider, Field, FormatChip, Panel, Segmented, Select, Toggle } from './PanelParts'
import { DEFAULT_AUDIO_SETTINGS, type AudioFormat, type ChannelMode, type SampleRate } from '../../lib/types'

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
      targetExt={target.ext}
      panel={
        <div className="flex flex-col gap-4">
          <AudioPanel />
        </div>
      }
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

  // Anything the user has moved away from its default, spelled out for the
  // collapsed header — and a reason to start the section open, so settings
  // carried over from an earlier conversion are never hidden.
  const changed: string[] = []
  if (target.lossy && settings.bitrateKbps !== DEFAULT_AUDIO_SETTINGS.bitrateKbps)
    changed.push(`${settings.bitrateKbps} kbps`)
  if (settings.sampleRate !== 'source')
    changed.push(SAMPLE_RATES.find((r) => r.value === settings.sampleRate)?.label ?? '')
  if (settings.channels !== 'source')
    changed.push(CHANNELS.find((c) => c.value === settings.channels)?.label ?? '')
  if (settings.normalise) changed.push('Normalised')
  if (settings.trim.enabled) changed.push('Trimmed')
  if (!settings.keepTags) changed.push('No tags')

  return (
    <>
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

        <Divider />

        <Collapsible
          label="Advanced"
          summary={changed.length ? changed.join(' · ') : 'Default settings'}
          defaultOpen={changed.length > 0}
        >
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

          <Toggle
            label="Keep title, artist &amp; album"
            hint={
              settings.format === 'mp3' || settings.format === 'opus'
                ? 'Read from the original and written into the converted file'
                : `Read from the original — ${audioFormatMeta(settings.format).label} output can’t carry them yet`
            }
            on={settings.keepTags}
            disabled={running}
            onChange={(keepTags) => update({ keepTags })}
          />
        </Collapsible>
      </Panel>

      <StudioActions kind="audio" canConvert={engineReady} />
    </>
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
