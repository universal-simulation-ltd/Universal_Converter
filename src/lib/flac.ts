import { toInt16 } from './pcm.ts'

// FLAC via libflacjs (MIT) — emscripten-compiled libFLAC (BSD). Both licences
// are permissive, so this is the one remaining format that ffmpeg would have
// handled and doesn't need the GPL decision.
//
// The glue is loaded as a plain <script> at first use rather than bundled: it's
// UMD emscripten output that resolves its own .wasm, and `FLAC_SCRIPT_LOCATION`
// is the hook the library provides for pointing it somewhere. ~230 KB, fetched
// only when someone actually converts to FLAC. scripts/sync-flac.mjs copies both
// files out of node_modules into public/flac/ on predev/prebuild.

interface FlacApi {
  isReady(): boolean
  on(event: string, handler: () => void): void
  create_libflac_encoder(
    sampleRate: number,
    channels: number,
    bitsPerSample: number,
    compressionLevel: number,
    totalSamples: number,
    verify?: boolean,
  ): number
  init_encoder_stream(
    encoder: number,
    write: (data: Uint8Array, bytes: number) => void,
    metadata?: () => void,
  ): number
  FLAC__stream_encoder_process_interleaved(encoder: number, buffer: Int32Array, samples: number): boolean
  FLAC__stream_encoder_finish(encoder: number): boolean
  FLAC__stream_encoder_delete(encoder: number): void
  FLAC__stream_encoder_get_state(encoder: number): number
}

/**
 * libFLAC compression level. 5 is the library's own default and the usual
 * "-5" of the `flac` command line: the knee of the size/time curve. 8 is barely
 * smaller and several times slower, which is a bad trade in a browser tab.
 */
const COMPRESSION_LEVEL = 5

/** Samples per channel handed to the encoder at a time. */
const CHUNK = 4096

const SCRIPT = 'libflac.min.wasm.js'
const WASM = 'libflac.min.wasm.wasm'

let loading: Promise<FlacApi | null> | null = null

function base(): string {
  return `${import.meta.env.BASE_URL}flac/`
}

function loadFlac(): Promise<FlacApi | null> {
  if (loading) return loading
  loading = (async () => {
    if (typeof document === 'undefined') return null
    const existing = (self as unknown as { Flac?: FlacApi }).Flac
    if (!existing) {
      // The glue looks this up to find its .wasm — a map keyed by filename, so
      // the base path can differ from wherever the bundle ended up.
      ;(self as unknown as { FLAC_SCRIPT_LOCATION?: Record<string, string> }).FLAC_SCRIPT_LOCATION = {
        [WASM]: `${base()}${WASM}`,
      }
      await new Promise<void>((resolve, reject) => {
        const el = document.createElement('script')
        el.src = `${base()}${SCRIPT}`
        el.onload = () => resolve()
        el.onerror = () => reject(new Error('the FLAC encoder failed to load'))
        document.head.appendChild(el)
      })
    }
    const Flac = (self as unknown as { Flac?: FlacApi }).Flac
    if (!Flac) return null
    if (!Flac.isReady()) {
      await new Promise<void>((resolve) => Flac.on('ready', () => resolve()))
    }
    return Flac
  })().catch(() => null)
  return loading
}

export async function flacSupported(): Promise<boolean> {
  return (await loadFlac()) !== null
}

export async function encodeFlac(
  channels: Float32Array[],
  sampleRate: number,
  onProgress: (fraction: number) => void = () => {},
): Promise<Blob> {
  const Flac = await loadFlac()
  if (!Flac) throw new Error('The FLAC encoder couldn’t be loaded — check your connection and try again')

  const numberOfChannels = channels.length
  const totalFrames = channels[0].length
  const parts: Uint8Array[] = []

  const encoder = Flac.create_libflac_encoder(
    sampleRate,
    numberOfChannels,
    16,
    COMPRESSION_LEVEL,
    totalFrames,
  )
  if (!encoder) throw new Error('The FLAC encoder wouldn’t start for this file')

  try {
    // The buffer handed to this callback is a view into wasm memory and is
    // reused immediately — it must be copied, not kept.
    const status = Flac.init_encoder_stream(encoder, (data, bytes) => {
      parts.push(new Uint8Array(data.subarray(0, bytes)))
    })
    if (status !== 0) throw new Error(`The FLAC encoder wouldn’t start (status ${status})`)

    const interleaved = new Int32Array(CHUNK * numberOfChannels)
    for (let offset = 0; offset < totalFrames; offset += CHUNK) {
      const count = Math.min(CHUNK, totalFrames - offset)
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < numberOfChannels; c++) {
          interleaved[i * numberOfChannels + c] = toInt16(channels[c][offset + i])
        }
      }
      const view = count === CHUNK ? interleaved : interleaved.subarray(0, count * numberOfChannels)
      if (!Flac.FLAC__stream_encoder_process_interleaved(encoder, view, count)) {
        throw new Error(`FLAC encoding failed (encoder state ${Flac.FLAC__stream_encoder_get_state(encoder)})`)
      }
      onProgress((offset + count) / totalFrames)
      // Yield so the progress bar repaints on long files.
      await Promise.resolve()
    }

    Flac.FLAC__stream_encoder_finish(encoder)
  } finally {
    Flac.FLAC__stream_encoder_delete(encoder)
  }

  if (parts.length === 0) throw new Error('The FLAC encoder returned nothing')
  return new Blob(parts as BlobPart[], { type: 'audio/flac' })
}
