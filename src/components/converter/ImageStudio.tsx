import { useEffect, useState } from 'react'
import { IMAGE_ACCEPT, IMAGE_FORMATS, imageFormatMeta, imageFormatSupported } from '../../lib/formats'
import { useConverterStore } from '../../stores/converterStore'
import OtherExports from './OtherExports'
import StudioShell from './StudioShell'
import { Divider, Field, FormatChip, Panel, PanelActions, Segmented, Select } from './PanelParts'
import type { ImageFormat, MaxEdge } from '../../lib/types'

const MAX_EDGES: { value: MaxEdge; label: string }[] = [
  { value: 'source', label: 'Keep original size' },
  { value: 2560, label: 'Fit within 2560 px' },
  { value: 1920, label: 'Fit within 1920 px' },
  { value: 1280, label: 'Fit within 1280 px' },
  { value: 640, label: 'Fit within 640 px' },
]

const QUALITIES: { value: number; label: string }[] = [
  { value: 0.6, label: 'Smaller' },
  { value: 0.82, label: 'Balanced' },
  { value: 0.95, label: 'Best' },
]

export default function ImageStudio() {
  const settings = useConverterStore((s) => s.image)
  const target = imageFormatMeta(settings.format)

  return (
    <StudioShell
      kind="image"
      accept={IMAGE_ACCEPT}
      emptyTitle="Drop images here"
      moreTitle="Drop more images here"
      formatsLine="PNG, JPEG, HEIC, WebP, GIF, BMP, AVIF and SVG"
      targetExt={target.ext}
      panel={
        <div className="flex flex-col gap-4">
          <ImagePanel />
          <OtherExports kind="image" />
        </div>
      }
    />
  )
}

function ImagePanel() {
  const settings = useConverterStore((s) => s.image)
  const running = useConverterStore((s) => s.running)
  const update = useConverterStore((s) => s.updateImage)

  // Canvas encoders fall back to PNG silently rather than failing, so each
  // format is probed once and the unsupported ones are disabled — AVIF is the
  // one that actually varies between browsers.
  const [supported, setSupported] = useState<Record<ImageFormat, boolean>>({
    png: true,
    jpeg: true,
    webp: true,
    avif: true,
  })

  useEffect(() => {
    let live = true
    void Promise.all(
      IMAGE_FORMATS.map(async (f) => [f.id, await imageFormatSupported(f.id)] as const),
    ).then((pairs) => {
      if (live) setSupported(Object.fromEntries(pairs) as Record<ImageFormat, boolean>)
    })
    return () => {
      live = false
    }
  }, [])

  const target = imageFormatMeta(settings.format)
  const ready = supported[settings.format]

  return (
    <Panel>
      <Field label="Convert to">
        <div className="flex flex-wrap gap-1.5">
          {IMAGE_FORMATS.map((f) => (
            <FormatChip
              key={f.id}
              label={f.label}
              selected={settings.format === f.id}
              ready={supported[f.id]}
              disabled={running}
              title={supported[f.id] ? undefined : `This browser can’t write ${f.label}`}
              onSelect={() => update({ format: f.id })}
            />
          ))}
        </div>
        <p className="text-[11px] text-slate-500">{target.blurb}</p>
        {!ready && (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-800">
            This browser can’t write {target.label}. WebP, JPEG and PNG work everywhere.
          </p>
        )}
      </Field>

      {target.lossy && (
        <Field label="Quality">
          <Segmented
            options={QUALITIES}
            value={nearestQuality(settings.quality)}
            disabled={running}
            onChange={(quality) => update({ quality })}
          />
          <p className="text-[10.5px] text-slate-400">
            Lossy formats trade detail for size. Balanced is the sweet spot for photos.
          </p>
        </Field>
      )}

      <Field label="Size">
        <Select
          options={MAX_EDGES}
          value={settings.maxEdge}
          disabled={running}
          onChange={(maxEdge) => update({ maxEdge })}
        />
        <p className="text-[10.5px] text-slate-400">
          Scales the longest edge down, keeping the aspect ratio. Never scales up.
        </p>
      </Field>

      <Divider />

      <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
        Metadata is dropped on the way through — the canvas re-encode keeps pixels, not EXIF. That
        means location and camera details don’t travel with the converted file.
      </p>

      <Divider />

      <PanelActions kind="image" canConvert={ready} />
    </Panel>
  )
}

// The stored quality is a float so it can be anything; the segmented control
// snaps to whichever of its three stops is closest.
function nearestQuality(quality: number): number {
  return QUALITIES.reduce((best, o) =>
    Math.abs(o.value - quality) < Math.abs(best.value - quality) ? o : best,
  ).value
}
