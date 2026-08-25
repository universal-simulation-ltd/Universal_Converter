import { aacSupported } from '@unisim/media'
import { DOC_INPUT_EXTS } from './doc'
import { flacSupported } from './flac'
import { opusSupported } from './opus'
import type { AudioFormat, Engine, ImageFormat, MediaKind, VideoTarget } from './types'

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
//
// GIF is the odd one out and the only target in this whole app the browser will
// not encode for us at all — there is no `toBlob('image/gif')` in any engine
// and no animation encoder anywhere — so the palette, the LZW and the file are
// all ours (gif.ts). It sits with MP4 rather than in "Other exports" because it
// is still the moving picture you dropped, in another format; what it drops is
// said in the blurb and again in the panel.
export const VIDEO_FORMATS: FormatMeta<VideoTarget>[] = [
  { id: 'mp4', label: 'MP4', ext: 'mp4', mime: 'video/mp4', lossy: true, engine: 'built-in', blurb: 'H.264 video with AAC audio — plays on everything.' },
  { id: 'gif', label: 'GIF', ext: 'gif', mime: 'image/gif', lossy: true, engine: 'built-in', blurb: 'Silent, 256 colours, and it animates inline in a chat, an email or a README.' },
]

export function videoFormatMeta(id: VideoTarget): FormatMeta<VideoTarget> {
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
// ⚠️ HEIC/HEIF is the one image input NO browser engine outside Safari will
// decode — `createImageBitmap` and <img> both refuse it — so it is only in
// this list because `image.ts` dynamic-imports a decoder when it meets one.
// Listing a format nothing can read queues the file and fails it a second
// later, which is the exact outcome this list exists to prevent.
export const IMAGE_INPUT_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'ico', 'svg', 'heic', 'heif']

// Documents. The list lives in `doc/index.ts` beside the reader that opens each
// one, so a new format is added in one place rather than two.
export const DOCUMENT_INPUT_EXTS: readonly string[] = DOC_INPUT_EXTS

// Narrower than the audio list on purpose. Video needs its container taken
// apart frame by frame (mp4read.ts), and only the ISO base media family — MP4,
// M4V, MOV — is one this reader can walk. MKV and AVI are different containers
// entirely and genuinely do need the ffmpeg core, so they're refused on drop
// with a sentence rather than accepted and failed later.
export const VIDEO_INPUT_EXTS = ['mp4', 'm4v', 'mov', 'qt']

export const AUDIO_ACCEPT = 'audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,.aif,.aiff,.webm,.caf,.mp4,.mov'
// `.heic`/`.heif` spelled out even though `image/*` is here: a photo straight
// off an iPhone often arrives with an EMPTY MIME type on Windows, and the
// wildcard alone then greys it out in the file picker.
export const IMAGE_ACCEPT = 'image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.svg,.heic,.heif'
export const VIDEO_ACCEPT = 'video/mp4,video/quicktime,.mp4,.m4v,.mov'
// Extensions only, no `application/*` wildcard: the browser's own MIME guesses
// for documents are unreliable (a .md is `text/markdown` on one machine and
// nothing at all on another), and a wildcard here would offer to open every
// binary on the disk.
export const DOCUMENT_ACCEPT = DOCUMENT_INPUT_EXTS.map((e) => `.${e}`).join(',')
/** The All tab takes anything and works out where it goes. */
export const ALL_ACCEPT = `${IMAGE_ACCEPT},${AUDIO_ACCEPT},${VIDEO_ACCEPT},${DOCUMENT_ACCEPT}`

/**
 * The tab a loose file belongs on.
 *
 * ⚠️ VIDEO IS TESTED BEFORE AUDIO, and that ordering is the whole correctness
 * of this function. `.mp4` appears in BOTH lists — deliberately, because
 * dropping a video on the audio tab is how you ask for its soundtrack (see
 * `acceptsOn`) — so testing audio first, as this did while it was dead code,
 * sends every single MP4 to the audio tab and silently throws the picture away.
 * `.m4a` is audio-only and is not in the video list, so it still routes right.
 *
 * `mime` is consulted first where it is meaningful, because a file with no
 * extension at all is common on a Mac and the browser usually knows anyway.
 */
export function kindOf(ext: string, mime = ''): MediaKind | null {
  const type = mime.toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (IMAGE_INPUT_EXTS.includes(ext)) return 'image'
  if (VIDEO_INPUT_EXTS.includes(ext)) return 'video'
  if (AUDIO_INPUT_EXTS.includes(ext)) return 'audio'
  if (DOCUMENT_INPUT_EXTS.includes(ext)) return 'document'
  // Extension LAST for documents, and MIME only as a fallback after it — the
  // reverse of the media rule above, because the browser's document MIME
  // guesses are the unreliable ones. A .md is `text/markdown` on one machine,
  // `text/plain` on another and empty on a third, and only the extension says
  // which reader to use. This line is what catches a file with no extension
  // at all, which on a Mac is common.
  if (type.startsWith('text/') || type === 'application/json') return 'document'
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
  if (kind === 'document') return DOCUMENT_INPUT_EXTS.includes(ext)
  return VIDEO_INPUT_EXTS.includes(ext)
}

/** The message shown on a row we refuse to queue. Names a way forward. */
export function unsupportedMessage(ext: string, kind: MediaKind): string {
  const named = ext ? ext.toUpperCase() : 'That file type'
  if (kind === 'image') return `${named} isn’t supported yet — try PNG, JPEG, HEIC, WebP, GIF or AVIF`
  if (kind === 'video') {
    return ext === 'mkv' || ext === 'avi' || ext === 'wmv' || ext === 'flv'
      ? `${named} is a container this converter can’t take apart — re-wrap it as MP4 or MOV first`
      : `${named} isn’t supported yet — try MP4, M4V or MOV`
  }
  if (kind === 'document') {
    // The three everybody tries, each with the reason and a way forward rather
    // than a flat refusal. A spreadsheet and a slide deck are the two most
    // common things dropped on a Files tab that it genuinely cannot do.
    if (ext === 'pdf') {
      return 'PDF is what this tab converts TO. To edit or split one, use Universal PDF'
    }
    if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
      return `${named} is a spreadsheet — save it as CSV from your spreadsheet app and this will convert it`
    }
    if (ext === 'pptx' || ext === 'ppt' || ext === 'odp' || ext === 'key') {
      return `${named} is a slide deck — export it to PDF from the app that made it`
    }
    if (ext === 'pages' || ext === 'numbers') {
      return `${named} is an Apple format nothing else can open — export it to DOCX or PDF from Pages first`
    }
    if (ext === 'epub' || ext === 'mobi' || ext === 'azw3') {
      return `${named} is an e-book — this converter doesn’t read those yet`
    }
    return `${named} isn’t supported yet — try DOCX, DOC, ODT, RTF, TXT, MD, HTML, CSV or JSON`
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
