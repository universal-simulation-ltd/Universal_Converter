import { formatDuration } from './humanise'

/**
 * Read a file's duration without decoding it: hand the blob to an <audio>
 * element and wait for metadata. Costs a few kilobytes of parsing rather than a
 * full decode, so a 400 MB file still lands in the queue instantly.
 *
 * Resolves null when the browser can't read it — the row still converts, it just
 * shows size only.
 */
export function probeDuration(file: File): Promise<number | null> {
  return queued(() => new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    let settled = false

    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      release(audio)
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
  }))
}

/**
 * A video row's subtitle: "1:32 · 1920×1080", from a <video> element's metadata
 * rather than a decode. Same contract as `probeDuration` — resolves null when
 * the browser can't read it, and the row still converts.
 */
export function probeVideo(file: File): Promise<string | null> {
  return queued(() => new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    let settled = false

    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      release(video)
      URL.revokeObjectURL(url)
      resolve(value)
    }

    const timer = setTimeout(() => finish(null), 5000)

    video.addEventListener('loadedmetadata', () => {
      const parts: string[] = []
      if (Number.isFinite(video.duration)) parts.push(formatDuration(video.duration))
      if (video.videoWidth && video.videoHeight) parts.push(`${video.videoWidth}×${video.videoHeight}`)
      finish(parts.length ? parts.join(' · ') : null)
    })
    video.addEventListener('error', () => finish(null))

    video.preload = 'metadata'
    video.src = url
  }))
}

/**
 * Revoking the blob URL does not make a media element let go of what it opened;
 * dropping its source and reloading does.
 */
function release(el: HTMLMediaElement) {
  el.removeAttribute('src')
  el.load()
}

/**
 * At most this many probes at once. Browsers cap live media players (Chrome
 * at a few dozen), and a dropped album folder of 300 tracks started them all
 * together: most waited for a player, hit the 5 s timeout and showed no
 * duration. Queued, each one's clock only starts when it really runs.
 */
const MAX_PROBES = 4
let active = 0
const waiting: (() => void)[] = []

function queued<T>(run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      active++
      run()
        .then(resolve, reject)
        .finally(() => {
          active--
          waiting.shift()?.()
        })
    }
    if (active < MAX_PROBES) start()
    else waiting.push(start)
  })
}
