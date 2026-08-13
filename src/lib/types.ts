// The video half of this vocabulary moved to @unisim/media when the pipeline was
// extracted (2026-08-06) — the settings, the trim window and the converted-file
// shape now have one definition shared with Universal Video rather than one per
// app. They are re-exported from here so nothing else in this app had to change
// its imports, and so `import … from '../lib/types'` still means what it did.
import type { ConvertedFile, TrimSettings } from '@unisim/media'

export type {
  ConvertedFile, TrimSettings, VideoSettings, VideoFormat, MaxHeight, VideoQuality,
} from '@unisim/media'
export { DEFAULT_VIDEO_SETTINGS } from '@unisim/media'

// 'document' joined the other three when the Files tab shipped. It is a
// MediaKind despite not being media, because everything the word buys here —
// its own queue, its own dropzone, its own settings panel, its own row in
// `addSorted` — is exactly what a fourth studio needs, and a parallel concept
// beside it would have meant a second version of all four.
export type MediaKind = 'audio' | 'image' | 'video' | 'document'

export type AudioFormat = 'wav' | 'mp3' | 'aiff' | 'flac' | 'm4a' | 'ogg' | 'opus'
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'avif'

// Which encoder backs a given target today.
//  • 'built-in' — our own writer or the browser's own canvas/audio encoder. No
//    download, works offline from the first visit.
//  • 'lame'     — LAME compiled to JS, dynamically imported on first MP3.
//  • 'libflac'  — libFLAC compiled to wasm, fetched from public/flac on first use.
//  • 'ffmpeg'   — needs the ffmpeg.wasm core, which isn't wired. See the README:
//    the only published core is GPL, so this is a licence decision, not a chore.
export type Engine = 'built-in' | 'lame' | 'libflac' | 'ffmpeg'

export type JobStatus = 'queued' | 'converting' | 'done' | 'failed' | 'unsupported'

export interface QueueItem {
  id: string
  file: File
  kind: MediaKind
  /** Source extension, lower-cased, no dot. */
  ext: string
  status: JobStatus
  /** 0–1, only meaningful while `status === 'converting'`. */
  progress: number
  /** Probed once on add: seconds for audio, "1920×1080" for images, both for video. */
  detail: string | null
  /** User-facing reason this row failed or was skipped. */
  error: string | null
  result: ConvertedFile | null
  /**
   * What the conversion SUCCEEDED at doing but had to give up on the way —
   * a .doc's formatting, a document's headers and footers, an alphabet the
   * PDF's built-in fonts can't spell.
   *
   * Deliberately separate from `error`. These rows are `done` and their file is
   * good; putting the sentence in `error` would paint a working conversion red,
   * and leaving it out entirely is how somebody finds out on page four.
   */
  notes: string[]
}

export type SampleRate = 'source' | 22050 | 44100 | 48000
export type ChannelMode = 'source' | 'stereo' | 'mono'

export interface AudioSettings {
  format: AudioFormat
  bitrateKbps: number
  sampleRate: SampleRate
  channels: ChannelMode
  normalise: boolean
  /** Carry title/artist/album across, where source and target both support them. */
  keepTags: boolean
  trim: TrimSettings
}

/** 'source' keeps the original pixel dimensions; a number is the longest edge. */
export type MaxEdge = 'source' | 640 | 1280 | 1920 | 2560

export interface ImageSettings {
  format: ImageFormat
  /** 0–1, only used by the lossy formats. */
  quality: number
  maxEdge: MaxEdge
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  format: 'mp3',
  bitrateKbps: 192,
  sampleRate: 'source',
  channels: 'source',
  normalise: false,
  keepTags: true,
  trim: { enabled: false, startSec: 0, endSec: null },
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  format: 'webp',
  quality: 0.82,
  maxEdge: 'source',
}
