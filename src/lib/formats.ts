import { aacSupported } from '@unisim/media'
import { flacSupported } from './flac'
import { opusSupported } from './opus'
import type { AudioFormat, Engine, ImageFormat, MediaKind, VideoFormat } from './types'

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
// (Ogg and MP4); FLAC is libFLAC compiled to wasm, fetched on first use. Only
// OGG (Vorbis) still wants the ffmpeg core. The UI reads `engine`
// and `audioFormatSupported()` to decide what to disable, so enabling one more
// is a one-line change here.
export const AUDIO_FORMATS: FormatMeta<AudioFormat>[] = [
  { id: 'mp3',  label: 'MP3',  ext: 'mp3',  mime: 'audio/mpeg', lossy: true,  engine: 'lame',     blurb: 'Plays everywhere. The default choice for sharing audio.' },
  { id: 'wav',  label: 'WAV',  ext: 'wav',  mime: 'audio/wav',  lossy: false, engine: 'built-in', blurb: 'Uncompressed PCM — the safe interchange format. Large files.' },
  { id: 'aiff', label: 'AIFF', ext: 'aiff', mime: 'audio/aiff', lossy: false, engine: 'built-in', blurb: 'Uncompressed, Apple’s counterpart to WAV.' },
  { id: 'flac', label: 'FLAC', ext: 'flac', mime: 'audio/flac', lossy: false, engine: 'libflac',  blurb: 'Lossless and compressed — about half the size of WAV.' },
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

// ── Video ────────────────────────────────────────────────────────────────────
// H.264 in MP4, from the browser's own WebCodecs `VideoEncoder` in a container
// we write (mp4mux.ts) — the same bargain Opus and M4A struck, and the reason
// video didn't have to wait on the ffmpeg licence decision either. WebM out
// would want a second muxer and a second codec; MP4 is the one that plays
// everywhere, so it's the one that shipped.
export const VIDEO_FORMATS: FormatMeta<VideoFormat>[] = [
  { id: 'mp4', label: 'MP4', ext: 'mp4', mime: 'video/mp4', lossy: true, engine: 'built-in', blurb: 'H.264 video with AAC audio — plays on everything.' },
]

export function videoFormatMeta(id: VideoFormat): FormatMeta<VideoFormat> {
  const found = VIDEO_FORMATS.find((f) => f.id === id)
  if (!found) throw new Error(`Unknown video format: ${id}`)
  return found
}

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

// Narrower than the audio list on purpose. Video needs its container taken
// apart frame by frame (mp4read.ts), and only the ISO base media family — MP4,
// M4V, MOV — is one this reader can walk. MKV and AVI are different containers
// entirely and genuinely do need the ffmpeg core, so they're refused on drop
// with a sentence rather than accepted and failed later.
export const VIDEO_INPUT_EXTS = ['mp4', 'm4v', 'mov', 'qt']

export const AUDIO_ACCEPT = 'audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,.aif,.aiff,.webm,.caf,.mp4,.mov'
export const IMAGE_ACCEPT = 'image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.svg'
export const VIDEO_ACCEPT = 'video/mp4,video/quicktime,.mp4,.m4v,.mov'

/** The tab a loose file belongs on, used when nothing else says. */
export function kindOf(ext: string): MediaKind | null {
  if (AUDIO_INPUT_EXTS.includes(ext)) return 'audio'
  if (IMAGE_INPUT_EXTS.includes(ext)) return 'image'
  if (VIDEO_INPUT_EXTS.includes(ext)) return 'video'
  return null
}

/**
 * Whether a file is welcome on the tab it was dropped on.
 *
 * This is not `kindOf(ext) === kind`, and the difference is the point: an MP4
 * is a video, but dropping one on the audio tab is a perfectly good way to ask
 * for its soundtrack — `decodeAudioData` reads the audio track directly, so the
 * whole audio pipeline works on it unchanged. That's what "extract the audio"
 * means here; it needs no separate mode.
 */
export function acceptsOn(ext: string, kind: MediaKind): boolean {
  if (kind === 'audio') return AUDIO_INPUT_EXTS.includes(ext) || VIDEO_INPUT_EXTS.includes(ext)
  if (kind === 'image') return IMAGE_INPUT_EXTS.includes(ext)
  return VIDEO_INPUT_EXTS.includes(ext)
}

/** The message shown on a row we refuse to queue. Names a way forward. */
export function unsupportedMessage(ext: string, kind: MediaKind): string {
  const named = ext ? ext.toUpperCase() : 'That file type'
  if (kind === 'image') return `${named} isn’t supported yet — try PNG, JPEG, WebP, GIF or AVIF`
  if (kind === 'video') {
    return ext === 'mkv' || ext === 'avi' || ext === 'wmv' || ext === 'flv'
      ? `${named} is a container this converter can’t take apart — re-wrap it as MP4 or MOV first`
      : `${named} isn’t supported yet — try MP4, M4V or MOV`
  }
  return `${named} isn’t supported yet — try WAV, MP3, M4A, FLAC or OGG`
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
  // FLAC's encoder is a separate download; if it can't be fetched the chip
  // disables itself rather than failing at conversion time.
  if (format === 'flac') return flacSupported()
  return Promise.resolve(true)
}
