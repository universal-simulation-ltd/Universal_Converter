/** "14.2 MB" — file sizes, always one decimal above a kilobyte. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

/** "12:41" / "1:04:18" — clock time, hours only when there are any. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return h > 0
    ? `${h}:${mm}:${String(sec).padStart(2, '0')}`
    : `${mm}:${String(sec).padStart(2, '0')}`
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

/** Swap a filename's extension, keeping any dots in the stem. */
export function withExtension(filename: string, ext: string): string {
  const dot = filename.lastIndexOf('.')
  const stem = dot < 1 ? filename : filename.slice(0, dot)
  return `${stem}.${ext}`
}
