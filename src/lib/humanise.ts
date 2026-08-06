// Three of these moved to @unisim/media with the video pipeline — the package
// needs them (a trim window's error message is a clock time; an output filename
// is an extension swap) and duplicating them here would be exactly the drift
// §10.6 warns about. They are re-exported so every call site in this app is
// unchanged, and so there is still one obvious place to look for them.
export { formatDuration, parseClock, withExtension } from '@unisim/media'

/** "14.2 MB" — file sizes, always one decimal above a kilobyte. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

/** "48 kHz" — sample rates read in kHz, dropping a trailing .0. */
export function formatSampleRate(hz: number): string {
  const khz = hz / 1000
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`
}

/** Lower-cased extension without the dot; '' when the name has none. */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot < 1 || dot === filename.length - 1) return ''
  return filename.slice(dot + 1).toLowerCase()
}

