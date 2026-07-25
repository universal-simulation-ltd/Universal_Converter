export type MediaKind = 'audio' | 'image'

export type AudioFormat = 'wav' | 'mp3' | 'aiff' | 'flac' | 'm4a' | 'ogg' | 'opus'
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'avif'

// Which encoder backs a given target today.
//  • 'built-in' — our own writer or the browser's own canvas/audio encoder. No
//    download, works offline from the first visit.
//  • 'lame'     — LAME compiled to JS, dynamically imported on first MP3.
//  • 'ffmpeg'   — needs the ffmpeg.wasm core, which isn't wired. See the README:
//    the only published core is GPL, so this is a licence decision, not a chore.
export type Engine = 'built-in' | 'lame' | 'ffmpeg'

export type JobStatus = 'queued' | 'converting' | 'done' | 'failed' | 'unsupported'

export interface ConvertedFile {
  blob: Blob
  name: string
}

export interface QueueItem {
  id: string
  file: File
  kind: MediaKind
  /** Source extension, lower-cased, no dot. */
  ext: string
  status: JobStatus
  /** 0–1, only meaningful while `status === 'converting'`. */
  progress: number
  /** Probed once on add: seconds for audio, "1920×1080" for images. */
  detail: string | null
  /** User-facing reason this row failed or was skipped. */
  error: string | null
  result: ConvertedFile | null
}

export type SampleRate = 'source' | 22050 | 44100 | 48000
export type ChannelMode = 'source' | 'stereo' | 'mono'

export interface AudioSettings {
  format: AudioFormat
  bitrateKbps: number
  sampleRate: SampleRate
  channels: ChannelMode
  normalise: boolean
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
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  format: 'webp',
  quality: 0.82,
  maxEdge: 'source',
}
