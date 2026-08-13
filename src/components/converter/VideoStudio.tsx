import { useEffect, useState } from 'react'
import { VIDEO_ACCEPT, VIDEO_FORMATS, videoFormatMeta } from '../../lib/formats'
import { formatDuration, parseClock } from '../../lib/humanise'
import { videoSupported } from '@unisim/media'
import { useConverterStore } from '../../stores/converterStore'
import OtherExports from './OtherExports'
import StudioShell from './StudioShell'
import { Collapsible, Divider, Field, FormatChip, Panel, PanelActions, Segmented, Select, Toggle } from './PanelParts'
import { DEFAULT_VIDEO_SETTINGS, type MaxHeight, type VideoQuality } from '../../lib/types'

// Phase 2 — video, on WebCodecs rather than ffmpeg. Deliberately a tab rather
// than a second app: it shares the queue, the settings vocabulary and the
// privacy story with audio and images, which is the point of one converter
// rather than three.

const HEIGHTS: { value: MaxHeight; label: string }[] = [
  { value: 'source', label: 'Keep original size' },
  { value: 2160, label: '4K — 2160p' },
  { value: 1440, label: '1440p' },
  { value: 1080, label: 'Full HD — 1080p' },
  { value: 720, label: 'HD — 720p' },
  { value: 480, label: '480p' },
]

const QUALITIES: { value: VideoQuality; label: string }[] = [
  { value: 'small', label: 'Smaller' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'high', label: 'Best' },
]

const AUDIO_BITRATES: { value: number; label: string }[] = [
  { value: 96, label: '96' },
  { value: 128, label: '128' },
  { value: 192, label: '192' },
  { value: 256, label: '256' },
]

export default function VideoStudio() {
  const settings = useConverterStore((s) => s.video)
  const target = videoFormatMeta(settings.format)

  return (
    <StudioShell
      kind="video"
      accept={VIDEO_ACCEPT}
      emptyTitle="Drop video here"
      moreTitle="Drop more video here"
      formatsLine="MP4, M4V and MOV"
      engineBadge="on-device encoder · works offline"
      targetExt={target.ext}
      panel={
        <div className="flex flex-col gap-4">
          <VideoPanel />
          <OtherExports kind="video" />
        </div>
      }
    />
  )
}

function VideoPanel() {
  const settings = useConverterStore((s) => s.video)
  const running = useConverterStore((s) => s.running)
  const update = useConverterStore((s) => s.updateVideo)

  // H.264 through WebCodecs isn't everywhere yet, so support is probed rather
  // than assumed — the same treatment Opus gets on the audio tab and AVIF on
  // the images tab.
  const [supported, setSupported] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    void videoSupported().then((ok) => {
      if (live) setSupported(ok)
    })
    return () => {
      live = false
    }
  }, [])

  const target = videoFormatMeta(settings.format)
  const engineReady = supported !== false

  const changed: string[] = []
  if (settings.maxHeight !== 'source') {
    changed.push(HEIGHTS.find((h) => h.value === settings.maxHeight)?.label ?? '')
  }
  if (settings.quality !== DEFAULT_VIDEO_SETTINGS.quality) {
    changed.push(QUALITIES.find((q) => q.value === settings.quality)?.label ?? '')
  }
  if (!settings.keepAudio) changed.push('Silent')
  else if (settings.audioBitrateKbps !== DEFAULT_VIDEO_SETTINGS.audioBitrateKbps) {
    changed.push(`Audio ${settings.audioBitrateKbps} kbps`)
  }
  if (settings.trim.enabled) changed.push('Trimmed')

  return (
    <Panel>
      <Field label="Convert to">
        <div className="flex flex-wrap gap-1.5">
          {VIDEO_FORMATS.map((f) => (
            <FormatChip
              key={f.id}
              label={f.label}
              selected={settings.format === f.id}
              ready={engineReady}
              disabled={running}
              onSelect={() => update({ format: f.id })}
            />
          ))}
        </div>
        <p className="text-[11px] text-slate-500">{target.blurb}</p>
        {supported === false && (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-800">
            This browser has no WebCodecs H.264 encoder, so video can’t be converted here — Chrome
            and Edge have one. The audio and images tabs work everywhere.
          </p>
        )}
      </Field>

      <Divider />

      <Collapsible
        label="Advanced"
        summary={changed.length ? changed.join(' · ') : 'Default settings'}
        defaultOpen={changed.length > 0}
      >
        <Field label="Resolution">
          <Select
            options={HEIGHTS}
            value={settings.maxHeight}
            disabled={running}
            onChange={(maxHeight) => update({ maxHeight })}
          />
          <p className="text-[10.5px] text-slate-400">
            Names the shorter edge, so a clip filmed upright stays upright. Never scaled up.
          </p>
        </Field>

        <Field label="Quality">
          <Segmented
            options={QUALITIES}
            value={settings.quality}
            disabled={running || !engineReady}
            onChange={(quality) => update({ quality })}
          />
          <p className="text-[10.5px] text-slate-400">
            Sets the bitrate from the frame size and rate, so 4K and 720p each get a budget that
            suits them.
          </p>
        </Field>

        <Divider />

        <Toggle
          label="Keep the audio"
          hint="Re-encoded to AAC alongside the picture. Off writes a silent file"
          on={settings.keepAudio}
          disabled={running}
          onChange={(keepAudio) => update({ keepAudio })}
        />

        {settings.keepAudio && (
          <Field label="Audio bitrate">
            <Segmented
              options={AUDIO_BITRATES}
              value={settings.audioBitrateKbps}
              disabled={running || !engineReady}
              onChange={(audioBitrateKbps) => update({ audioBitrateKbps })}
            />
            <p className="text-[10.5px] text-slate-400">
              kbps, constant. 128 is plenty for anything but music.
            </p>
          </Field>
        )}

        <Toggle
          label="Trim"
          hint="Keep only part of each file — same window for the whole queue"
          on={settings.trim.enabled}
          disabled={running}
          onChange={(enabled) => update({ trim: { ...settings.trim, enabled } })}
        />

        {settings.trim.enabled && <TrimFields />}
      </Collapsible>

      <Divider />

      <PanelActions kind="video" canConvert={engineReady} />
    </Panel>
  )
}

// The audio tab's trim fields, against the video settings. Same strictness: an
// unparseable field says so and holds the last good value rather than silently
// trimming from zero.
function TrimFields() {
  const trim = useConverterStore((s) => s.video.trim)
  const running = useConverterStore((s) => s.running)
  const update = useConverterStore((s) => s.updateVideo)

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
          : 'Cuts begin at the nearest keyframe at or before the start time.'}
      </p>
    </div>
  )
}
