import type { AudioFormat, Engine } from './types'

export interface FormatMeta {
  id: AudioFormat
  /** Chip label. */
  label: string
  /** Output file extension, no dot. */
  ext: string
  mime: string
  lossless: boolean
  /** Whether the target takes a bitrate/quality setting at all. */
  lossy: boolean
  engine: Engine
  /** One line, shown under the format chips when selected. */
  blurb: string
}

// Phase 1 target matrix. Only WAV is reachable with the browser's own decoder;
// everything else waits on the ffmpeg.wasm core. The UI reads `engine` to decide
// what to disable, so wiring the engine is a one-line change per row here — not
// a rewrite of the panel.
export const FORMATS: FormatMeta[] = [
  { id: 'wav',  label: 'WAV',  ext: 'wav',  mime: 'audio/wav',   lossless: true,  lossy: false, engine: 'web-audio', blurb: 'Uncompressed PCM — the safe interchange format. Large files.' },
  { id: 'mp3',  label: 'MP3',  ext: 'mp3',  mime: 'audio/mpeg',  lossless: false, lossy: true,  engine: 'ffmpeg',    blurb: 'Plays everywhere. The default choice for sharing audio.' },
  { id: 'flac', label: 'FLAC', ext: 'flac', mime: 'audio/flac',  lossless: true,  lossy: false, engine: 'ffmpeg',    blurb: 'Lossless and compressed — about half the size of WAV.' },
  { id: 'm4a',  label: 'M4A',  ext: 'm4a',  mime: 'audio/mp4',   lossless: false, lossy: true,  engine: 'ffmpeg',    blurb: 'AAC in an MP4 container — Apple’s default, small and clean.' },
  { id: 'ogg',  label: 'OGG',  ext: 'ogg',  mime: 'audio/ogg',   lossless: false, lossy: true,  engine: 'ffmpeg',    blurb: 'Vorbis — open format, good quality per kilobyte.' },
  { id: 'opus', label: 'Opus', ext: 'opus', mime: 'audio/opus',  lossless: false, lossy: true,  engine: 'ffmpeg',    blurb: 'Best quality at low bitrates. Ideal for speech and podcasts.' },
  { id: 'aiff', label: 'AIFF', ext: 'aiff', mime: 'audio/aiff',  lossless: true,  lossy: false, engine: 'ffmpeg',    blurb: 'Uncompressed, Apple’s counterpart to WAV.' },
]

export function formatMeta(id: AudioFormat): FormatMeta {
  const found = FORMATS.find((f) => f.id === id)
  if (!found) throw new Error(`Unknown output format: ${id}`)
  return found
}

// Inputs the browser's own decoder can usually read. The list is deliberately
// conservative: anything outside it is rejected on drop with a message naming a
// format that does work, rather than failing halfway through a conversion.
// It widens considerably once ffmpeg.wasm is wired in.
export const SUPPORTED_INPUT_EXTS = ['wav', 'mp3', 'm4a', 'mp4', 'aac', 'flac', 'ogg', 'oga', 'opus', 'aif', 'aiff', 'webm', 'weba', 'caf']

export const INPUT_ACCEPT = 'audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,.aif,.aiff,.webm,.caf'

export function isSupportedInput(ext: string): boolean {
  return SUPPORTED_INPUT_EXTS.includes(ext)
}

/** The message shown on a row we refuse to queue. Names a way forward. */
export function unsupportedMessage(ext: string): string {
  const named = ext ? ext.toUpperCase() : 'That file type'
  return `${named} isn’t supported yet — try WAV, MP3, M4A, FLAC or OGG`
}
