import { useEffect, useState } from 'react'
import { VIDEO_FORMATS, videoFormatMeta } from '../../lib/formats'
import { formatDuration, parseClock } from '../../lib/humanise'
import { videoSupported } from '@unisim/media'
import { gifExportSupported } from '../../lib/videogif'
import { useConverterStore } from '../../stores/converterStore'
import OtherExports from './OtherExports'
import StudioActions from './StudioActions'
import StudioShell from './StudioShell'
import { Collapsible, Divider, Field, FormatChip, Panel, Segmented, Select, Toggle } from './PanelParts'
import {
  DEFAULT_GIF_SETTINGS,
  DEFAULT_VIDEO_SETTINGS,
  type GifEdge,
  type GifFps,
  type MaxHeight,
  type VideoQuality,
  type VideoTarget,
} from '../../lib/types'

// Phase 2 — video, on WebCodecs rather than ffmpeg. Deliberately a tab rather
// than a second app: it shares the queue, the settings vocabulary and the
// privacy story with audio and images, which is the point of one converter
// rather than three.
//
// Two targets now, and they do not want the same settings: an MP4 has a
// bitrate, a resolution and a soundtrack, and a GIF has none of the three. So
// the panel swaps its middle rather than greying half of it out — a quality
// slider that cannot affect the file is worse than an absent one.

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

// The GIF's own ladder, and a much shorter one. "Keep original size" is offered
// last rather than first because on this target it is nearly always the wrong
// answer — see DEFAULT_GIF_SETTINGS.
const GIF_EDGES: { value: GifEdge; label: string }[] = [
  { value: 640, label: '640 px' },
  { value: 480, label: '480 px' },
  { value: 320, label: '320 px' },
  { value: 240, label: '240 px' },
  { value: 'source', label: 'Keep original size' },
]

const GIF_RATES: { value: GifFps; label: string }[] = [
  { value: 10, label: '10' },
  { value: 15, label: '15' },
  { value: 20, label: '20' },
  { value: 25, label: '25' },
]

export default function VideoStudio() {
  const target = videoFormatMeta(useConverterStore((s) => s.videoTarget))

  return (
    <StudioShell
      kind="video"
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
  const videoTarget = useConverterStore((s) => s.videoTarget)
  const running = useConverterStore((s) => s.running)
  const setTarget = useConverterStore((s) => s.setVideoTarget)

  // Both halves of WebCodecs are probed, and separately, because the two
  // targets need different halves of it: an MP4 out needs the H.264 ENCODER,
  // a GIF needs only the DECODER. A browser that can read a video but not write
  // one can still make a GIF, and treating "no encoder" as "no video" would
  // switch off the one target that still worked.
  const [encoderReady, setEncoderReady] = useState<boolean | null>(null)
  const [decoderReady, setDecoderReady] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    void videoSupported().then((ok) => {
      if (live) setEncoderReady(ok)
    })
    void gifExportSupported().then((ok) => {
      if (live) setDecoderReady(ok)
    })
    return () => {
      live = false
    }
  }, [])

  // Unknown counts as ready: the probes resolve in a moment, and a chip that
  // starts disabled and enables itself reads as broken.
  const readyFor = (id: VideoTarget) => (id === 'gif' ? decoderReady !== false : encoderReady !== false)
  const target = videoFormatMeta(videoTarget)
  const engineReady = readyFor(videoTarget)

  return (
    <>
      <Panel>
        <Field label="Convert to">
          <div className="flex flex-wrap gap-1.5">
            {VIDEO_FORMATS.map((f) => (
              <FormatChip
                key={f.id}
                label={f.label}
                selected={videoTarget === f.id}
                ready={readyFor(f.id)}
                disabled={running}
                onSelect={() => setTarget(f.id)}
              />
            ))}
          </div>
          <p className="text-[11px] text-slate-500">{target.blurb}</p>

          {videoTarget === 'gif' && (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11.5px] leading-snug text-amber-800">
              <span className="font-semibold">A GIF has no sound</span>, and 256 colours in the whole
              animation — so a gradient or a sunset will band a little. It is also much larger than
              the same clip as MP4: a few seconds is a few megabytes. Keep it short.
            </p>
          )}

          {videoTarget === 'mp4' && encoderReady === false && (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11.5px] leading-snug text-amber-800">
              This browser has no WebCodecs H.264 encoder, so it can’t write an MP4.
              {decoderReady === true
                ? ' It can still read one, so GIF above will work here. Chrome and Edge do both.'
                : ' Chrome and Edge have one. The audio and images tabs work everywhere.'}
            </p>
          )}

          {videoTarget === 'gif' && decoderReady === false && (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11.5px] leading-snug text-amber-800">
              This browser has no WebCodecs H.264 decoder, so it can’t take a video apart to make a
              GIF — Chrome and Edge have one. The audio and images tabs work everywhere.
            </p>
          )}
        </Field>

        <Divider />

        {videoTarget === 'gif' ? <GifAdvanced /> : <Mp4Advanced engineReady={engineReady} />}
      </Panel>

      <StudioActions kind="video" canConvert={engineReady} />
    </>
  )
}

function Mp4Advanced({ engineReady }: { engineReady: boolean }) {
  const settings = useConverterStore((s) => s.video)
  const running = useConverterStore((s) => s.running)
  const update = useConverterStore((s) => s.updateVideo)

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

      <TrimToggle />
    </Collapsible>
  )
}

function GifAdvanced() {
  const settings = useConverterStore((s) => s.gif)
  const trim = useConverterStore((s) => s.video.trim)
  const running = useConverterStore((s) => s.running)
  const update = useConverterStore((s) => s.updateGif)

  const changed: string[] = []
  if (settings.maxEdge !== DEFAULT_GIF_SETTINGS.maxEdge) {
    changed.push(GIF_EDGES.find((e) => e.value === settings.maxEdge)?.label ?? '')
  }
  if (settings.fps !== DEFAULT_GIF_SETTINGS.fps) changed.push(`${settings.fps} fps`)
  if (settings.dither) changed.push('Dithered')
  if (!settings.loop) changed.push('Plays once')
  if (trim.enabled) changed.push('Trimmed')

  return (
    <Collapsible
      label="Advanced"
      summary={changed.length ? changed.join(' · ') : `${DEFAULT_GIF_SETTINGS.maxEdge} px · ${DEFAULT_GIF_SETTINGS.fps} fps`}
      defaultOpen={changed.length > 0}
    >
      <Field label="Size">
        <Select
          options={GIF_EDGES}
          value={settings.maxEdge}
          disabled={running}
          onChange={(maxEdge) => update({ maxEdge })}
        />
        <p className="text-[10.5px] text-slate-400">
          The longest edge, so an upright clip stays upright. Never scaled up. Halving this is the
          single biggest thing you can do to the file size.
        </p>
      </Field>

      <Field label="Frame rate">
        <Segmented
          options={GIF_RATES}
          value={settings.fps}
          disabled={running}
          onChange={(fps) => update({ fps })}
        />
        <p className="text-[10.5px] text-slate-400">
          Frames per second. 25 is the most a GIF can hold to honestly — its timing is measured in
          hundredths of a second, and 30 fps doesn’t divide into them.
        </p>
      </Field>

      <Divider />

      <Toggle
        label="Smooth the colours"
        hint="Dithers gradients so they don’t band — but it makes the file noticeably bigger"
        on={settings.dither}
        disabled={running}
        onChange={(dither) => update({ dither })}
      />

      <Toggle
        label="Loop forever"
        hint="Off plays the animation once and stops on the last frame"
        on={settings.loop}
        disabled={running}
        onChange={(loop) => update({ loop })}
      />

      <TrimToggle />
    </Collapsible>
  )
}

/**
 * The trim switch and its fields, shared by both targets and reading one piece
 * of state — `video.trim`. Somebody who types a window, then changes their mind
 * about MP4 versus GIF, should not have to type it again.
 */
function TrimToggle() {
  const trim = useConverterStore((s) => s.video.trim)
  const running = useConverterStore((s) => s.running)
  const update = useConverterStore((s) => s.updateVideo)

  return (
    <>
      <Toggle
        label="Trim"
        hint="Keep only part of each file — same window for the whole queue"
        on={trim.enabled}
        disabled={running}
        onChange={(enabled) => update({ trim: { ...trim, enabled } })}
      />
      {trim.enabled && <TrimFields />}
    </>
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
