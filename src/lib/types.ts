export type AudioFormat = 'wav' | 'mp3' | 'flac' | 'm4a' | 'ogg' | 'opus' | 'aiff'

// Which engine can produce a given target today.
//  • 'web-audio' — decode + re-encode with the browser's own Web Audio API.
//    No download, works offline from the first visit. PCM targets only.
//  • 'ffmpeg'    — needs the lazily-fetched ffmpeg.wasm core (~31 MB). Not
//    wired yet; see README "Phase 1, step 2".
export type Engine = 'web-audio' | 'ffmpeg'

export type JobStatus = 'queued' | 'converting' | 'done' | 'failed' | 'unsupported'

export interface ConvertedFile {
  blob: Blob
  name: string
}

export interface QueueItem {
  id: string
  file: File
  /** Source extension, lower-cased, no dot. */
  ext: string
  status: JobStatus
  /** 0–1, only meaningful while `status === 'converting'`. */
  progress: number
  /** Probed once on add; null while probing or if the browser can't read it. */
  durationSec: number | null
  /** User-facing reason this row failed or was skipped. */
  error: string | null
  result: ConvertedFile | null
}

export type SampleRate = 'source' | 22050 | 44100 | 48000
export type ChannelMode = 'source' | 'stereo' | 'mono'

export interface OutputSettings {
  format: AudioFormat
  rateMode: 'vbr' | 'cbr'
  bitrateKbps: number
  sampleRate: SampleRate
  channels: ChannelMode
  normalise: boolean
  keepTags: boolean
}

export const DEFAULT_SETTINGS: OutputSettings = {
  format: 'wav',
  rateMode: 'vbr',
  bitrateKbps: 192,
  sampleRate: 'source',
  channels: 'source',
  normalise: false,
  keepTags: true,
}
