export type MediaKind = 'audio' | 'image' | 'video'

export type AudioFormat = 'wav' | 'mp3' | 'aiff' | 'flac' | 'm4a' | 'ogg' | 'opus'
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'avif'
export type VideoFormat = 'mp4'

// Which encoder backs a given target today.
//  • 'built-in' — our own writer or the browser's own canvas/audio encoder. No
//    download, works offline from the first visit.
//  • 'lame'     — LAME compiled to JS, dynamically imported on first MP3.
//  • 'libflac'  — libFLAC compiled to wasm, fetched from public/flac on first use.
//  • 'ffmpeg'   — needs the ffmpeg.wasm core, which isn't wired. See the README:
//    the only published core is GPL, so this is a licence decision, not a chore.
export type Engine = 'built-in' | 'lame' | 'libflac' | 'ffmpeg'

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
  /** Probed once on add: seconds for audio, "1920×1080" for images, both for video. */
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
  /** Carry title/artist/album across, where source and target both support them. */
  keepTags: boolean
  trim: TrimSettings
}

/**
 * Start/end offsets in seconds, applied to every file in the queue — the output
 * panel is batch-wide by design, so "top and tail this batch of recordings" is
 * the case this serves. `endSec: null` means "to the end of the file".
 */
export interface TrimSettings {
  enabled: boolean
  startSec: number
  endSec: number | null
}

/** 'source' keeps the original pixel dimensions; a number is the longest edge. */
export type MaxEdge = 'source' | 640 | 1280 | 1920 | 2560

export interface ImageSettings {
  format: ImageFormat
  /** 0–1, only used by the lossy formats. */
  quality: number
  maxEdge: MaxEdge
}

/**
 * How much picture to keep. Names the *short* edge, so "1080p" is 1080 tall for
 * a landscape clip and 1080 wide for one shot on a phone held upright.
 */
export type MaxHeight = 'source' | 480 | 720 | 1080 | 1440 | 2160

/** Bitrate is derived from frame size and rate, not set directly — see video.ts. */
export type VideoQuality = 'high' | 'balanced' | 'small'

export interface VideoSettings {
  format: VideoFormat
  maxHeight: MaxHeight
  quality: VideoQuality
  /** Off writes a silent file — smaller, and sometimes the point. */
  keepAudio: boolean
  audioBitrateKbps: number
  trim: TrimSettings
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

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  format: 'mp4',
  maxHeight: 'source',
  quality: 'balanced',
  keepAudio: true,
  audioBitrateKbps: 128,
  trim: { enabled: false, startSec: 0, endSec: null },
}
