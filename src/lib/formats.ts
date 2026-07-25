import { aacSupported } from './aac'
import { opusSupported } from './opus'
import type { AudioFormat, Engine, ImageFormat, MediaKind } from './types'

export interface FormatMeta<T extends string> {
  id: T
  /** Chip label. */
  label: string
  /** Output file extension, no dot. */
  ext: string
  mime: string
  /** Does a quality/bitrate setting apply? */
  lossy: boolean
  engine: Engine
  /** One line, shown under the format chips when selected. */
  blurb: string
}

// ── Audio ────────────────────────────────────────────────────────────────────
// WAV and AIFF are our own PCM writers; MP3 is LAME-in-JS, loaded on first use;
// Opus and M4A are the browser's own WebCodecs encoders in containers we write
// (Ogg and MP4). Only FLAC and OGG (Vorbis) still want the ffmpeg core. The UI reads `engine`
// and `audioFormatSupported()` to decide what to disable, so enabling one more
// is a one-line change here.
export const AUDIO_FORMATS: FormatMeta<AudioFormat>[] = [
  { id: 'mp3',  label: 'MP3',  ext: 'mp3',  mime: 'audio/mpeg', lossy: true,  engine: 'lame',     blurb: 'Plays everywhere. The default choice for sharing audio.' },
  { id: 'wav',  label: 'WAV',  ext: 'wav',  mime: 'audio/wav',  lossy: false, engine: 'built-in', blurb: 'Uncompressed PCM — the safe interchange format. Large files.' },
  { id: 'aiff', label: 'AIFF', ext: 'aiff', mime: 'audio/aiff', lossy: false, engine: 'built-in', blurb: 'Uncompressed, Apple’s counterpart to WAV.' },
  { id: 'flac', label: 'FLAC', ext: 'flac', mime: 'audio/flac', lossy: false, engine: 'ffmpeg',   blurb: 'Lossless and compressed — about half the size of WAV.' },
  { id: 'm4a',  label: 'M4A',  ext: 'm4a',  mime: 'audio/mp4',  lossy: true,  engine: 'built-in', blurb: 'AAC in an MP4 container — Apple’s default, small and clean.' },
  { id: 'ogg',  label: 'OGG',  ext: 'ogg',  mime: 'audio/ogg',  lossy: true,  engine: 'ffmpeg',   blurb: 'Vorbis — open format, good quality per kilobyte.' },
  { id: 'opus', label: 'Opus', ext: 'opus', mime: 'audio/ogg',  lossy: true,  engine: 'built-in', blurb: 'Best quality at low bitrates. Ideal for speech and podcasts.' },
]

// ── Images ───────────────────────────────────────────────────────────────────
// All four go through the browser's own canvas encoder — no library, no
// download. AVIF support varies by browser, so it's probed at runtime
// (see `imageFormatSupported`) rather than assumed.
export const IMAGE_FORMATS: FormatMeta<ImageFormat>[] = [
  { id: 'webp', label: 'WebP', ext: 'webp', mime: 'image/webp', lossy: true,  engine: 'built-in', blurb: 'Smaller than JPEG at the same quality, and it keeps transparency.' },
  { id: 'jpeg', label: 'JPEG', ext: 'jpg',  mime: 'image/jpeg', lossy: true,  engine: 'built-in', blurb: 'Universal. No transparency — anything see-through fills with white.' },
  { id: 'png',  label: 'PNG',  ext: 'png',  mime: 'image/png',  lossy: false, engine: 'built-in', blurb: 'Lossless with transparency. Best for screenshots, logos and line art.' },
  { id: 'avif', label: 'AVIF', ext: 'avif', mime: 'image/avif', lossy: true,  engine: 'built-in', blurb: 'The smallest of the four, but slower to encode and newer to support.' },
]

export function audioFormatMeta(id: AudioFormat): FormatMeta<AudioFormat> {
  const found = AUDIO_FORMATS.find((f) => f.id === id)
  if (!found) throw new Error(`Unknown audio format: ${id}`)
  return found
}

export function imageFormatMeta(id: ImageFormat): FormatMeta<ImageFormat> {
  const found = IMAGE_FORMATS.find((f) => f.id === id)
  if (!found) throw new Error(`Unknown image format: ${id}`)
  return found
}

// ── Inputs ───────────────────────────────────────────────────────────────────
// Deliberately conservative: anything outside these lists is refused on drop
// with a message naming a format that does work, rather than failing halfway
// through a conversion.
export const AUDIO_INPUT_EXTS = ['wav', 'mp3', 'm4a', 'mp4', 'aac', 'flac', 'ogg', 'oga', 'opus', 'aif', 'aiff', 'webm', 'weba', 'caf']
export const IMAGE_INPUT_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'ico', 'svg']

export const AUDIO_ACCEPT = 'audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,.aif,.aiff,.webm,.caf'
export const IMAGE_ACCEPT = 'image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.svg'

export function kindOf(ext: string): MediaKind | null {
  if (AUDIO_INPUT_EXTS.includes(ext)) return 'audio'
  if (IMAGE_INPUT_EXTS.includes(ext)) return 'image'
  return null
}

/** The message shown on a row we refuse to queue. Names a way forward. */
export function unsupportedMessage(ext: string, kind: MediaKind): string {
  const named = ext ? ext.toUpperCase() : 'That file type'
  return kind === 'audio'
    ? `${named} isn’t supported yet — try WAV, MP3, M4A, FLAC or OGG`
    : `${named} isn’t supported yet — try PNG, JPEG, WebP, GIF or AVIF`
}

// Canvas encoders fail *silently* — an unsupported type falls back to PNG
// rather than throwing — so support is probed by encoding one pixel and reading
// back the MIME type the browser actually produced. Cached; runs once per type.
const supportCache = new Map<ImageFormat, Promise<boolean>>()

export function imageFormatSupported(format: ImageFormat): Promise<boolean> {
  const cached = supportCache.get(format)
  if (cached) return cached

  const probe = (async () => {
    if (typeof document === 'undefined') return false
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const mime = imageFormatMeta(format).mime
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime))
    return blob?.type === mime
  })()

  supportCache.set(format, probe)
  return probe
}

/**
 * Whether this browser can actually produce a given audio target. Only Opus
 * varies — it rides on WebCodecs, which not every engine implements — so the
 * rest answer true immediately rather than paying for a probe.
 */
export function audioFormatSupported(format: AudioFormat): Promise<boolean> {
  const meta = audioFormatMeta(format)
  if (meta.engine === 'ffmpeg') return Promise.resolve(false)
  if (format === 'opus') return opusSupported()
  if (format === 'm4a') return aacSupported()
  return Promise.resolve(true)
}
