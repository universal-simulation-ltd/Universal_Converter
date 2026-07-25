/**
 * Read a file's duration without decoding it: hand the blob to an <audio>
 * element and wait for metadata. Costs a few kilobytes of parsing rather than a
 * full decode, so a 400 MB file still lands in the queue instantly.
 *
 * Resolves null when the browser can't read it — the row still converts, it just
 * shows size only.
 */
export function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    let settled = false

    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(value)
    }

    // Some containers never fire either event (a stream with no duration in the
    // header); don't leave the row spinning forever.
    const timer = setTimeout(() => finish(null), 5000)

    audio.addEventListener('loadedmetadata', () => {
      finish(Number.isFinite(audio.duration) ? audio.duration : null)
    })
    audio.addEventListener('error', () => finish(null))

    audio.preload = 'metadata'
    audio.src = url
  })
}
