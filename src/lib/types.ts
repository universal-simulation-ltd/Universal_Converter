// The video half of this vocabulary moved to @unisim/media when the pipeline was
// extracted (2026-08-06) — the settings, the trim window and the converted-file
// shape now have one definition shared with Universal Video rather than one per
// app. They are re-exported from here so nothing else in this app had to change
// its imports, and so `import … from '../lib/types'` still means what it did.
import type { ConvertedFile, TrimSettings, VideoFormat } from '@unisim/media'

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
/**
 * ⚠️ **`gif` is in this list and the browser cannot write one.** Every other
 * member goes through `canvas.toBlob`; GIF goes through our own writer
 * (`gif.ts`), because no engine has ever exposed a GIF encoder — and, for an
 * animated source, our own reader too (`gifdecode.ts`), because
 * `createImageBitmap` returns frame one of an animation and says nothing about
 * the rest. So `imageFormatSupported('gif')` must not probe the canvas: the
 * probe would answer "no" for the one target that always works.
 */
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'avif' | 'gif'

/**
 * What the video tab can produce — the package's `VideoFormat` plus GIF.
 *
 * ⚠️ GIF is deliberately NOT added to `VideoFormat` in @unisim/media, and this
 * is not squeamishness about publishing. `VideoSettings` is quality, audio
 * bitrate and keep-audio, and NONE of the three mean anything to a GIF: it has
 * no bitrate, no audio track and no concept of either. Widening the package's
 * type would put a value into a struct where most of the surrounding fields are
 * dead, and every consumer of the package would then have to know which ones.
 * The GIF's own settings live below, beside the writer that reads them. If
 * Universal Video ever wants GIF out, the encoder moves to the package then —
 * with a settings type of its own, which is exactly what this is.
 */
export type VideoTarget = VideoFormat | 'gif'

/** The longest edge of the GIF, or the source's own size. */
export type GifEdge = 'source' | 240 | 320 | 480 | 640

/**
 * Frames per second. Capped at 25 because a GIF's delay is measured in
 * hundredths of a second, so 30 fps cannot be expressed — it is 3.33
 * hundredths, and the nearest legal value plays 10% slow.
 */
export type GifFps = 10 | 15 | 20 | 25

export interface GifSettings {
  maxEdge: GifEdge
  fps: GifFps
  /** Floyd–Steinberg. Smoother gradients, noticeably bigger file — see gif.ts. */
  dither: boolean
  /** Off plays the animation once and stops on the last frame. */
  loop: boolean
}

/**
 * 480 px and 15 fps, NOT the source's own size and rate.
 *
 * The only default in this app that does not mean "keep what you gave me", and
 * on purpose: an untouched 1080p/30 clip makes a GIF of a few hundred megabytes
 * that no chat window, README or email will accept. Every other tab can afford
 * to default to fidelity because every other target compresses; this one has to
 * default to something sendable, because a GIF nobody can send is not a
 * conversion, it is a download that failed slowly.
 */
export const DEFAULT_GIF_SETTINGS: GifSettings = {
  maxEdge: 480,
  fps: 15,
  dither: false,
  loop: true,
}

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
  /**
   * Frames, for an ANIMATED GIF only — absent for every other file, including a
   * still GIF.
   *
   * The row's caption could have carried this alone, but the PANEL needs it as
   * a fact rather than as text: converting an animated GIF to PNG, JPEG, WebP
   * or AVIF keeps only the first frame, and that has to be said before the
   * button is pressed rather than discovered afterwards. Parsing it back out of
   * `detail` would be reading a sentence to recover a number we had.
   */
  frames?: number
  /**
   * Does this image carry transparency? Images only, and absent until the row
   * has been sampled.
   *
   * Same reasoning as `frames` directly above: the PANEL needs it as a fact,
   * not as text. JPEG has no alpha channel at all, so `image.ts` fills white
   * behind every conversion to it — which is the right rendering and a silent
   * loss, and since JPEG is now the DEFAULT target it is a loss somebody can
   * reach without choosing anything. `hasTransparency` on the sample is where
   * it is measured; see the caveat there about what a sample can and cannot
   * prove.
   */
  hasAlpha?: boolean
  /** User-facing reason this row failed or was skipped. */
  error: string | null
  result: ConvertedFile | null
  /**
   * Did this row's file save itself, without anybody pressing a save button?
   *
   * True only on the single-file path in `convertAll`, which downloads the one
   * result the moment it is ready. It exists so the button underneath can stop
   * lying: it used to read "Download the converted file" over a file already
   * sitting in the downloads folder, and pressing it put a second identical
   * copy there — same name, same bytes — which is what a browser does with two
   * downloads and not what anybody meant to ask for.
   *
   * ⚠️ Lives on the ITEM rather than in store state on purpose. Every path that
   * invalidates a result — `rearmed` on any settings change, a requeue, the row
   * being removed — already clears the item's fields, so the flag cannot
   * outlive the download it describes. A store-level flag would need every one
   * of those paths to remember it, and the one that forgot would leave the
   * button claiming a file had been saved when it had not.
   */
  savedAutomatically?: boolean
  /**
   * Bytes the conversion is expected to produce, before it runs — images only.
   *
   * Null means "not known", which covers a row still being sampled, a format
   * this browser cannot write, and every non-image kind. Audio, video and
   * documents have no equivalent: an MP3's size is its bitrate times its
   * duration and is already implied by the panel, while a PDF's depends on
   * work that IS the conversion. See `lib/estimate.ts`.
   */
  estimate: number | null
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
  /**
   * 0–1, only used by the lossy formats.
   *
   * ⚠️ For GIF it means something different in kind, not just in degree: there
   * is no quantiser to loosen, only a palette to narrow, so it sets how many of
   * the 255 colours the format allows get used. The control is the same three
   * stops and the direction is the same, which is why it is the same field.
   */
  quality: number
  maxEdge: MaxEdge
  /**
   * Floyd–Steinberg dithering. **GIF only** — every other image target here has
   * millions of colours available and nothing to dither.
   *
   * Off by default for the same reason it is off on the video tab: dithering
   * replaces flat areas with fine noise, and on an ANIMATED GIF that noise
   * differs from frame to frame even where nothing moved, which defeats frame
   * differencing and can double or triple the file. It is worth turning on for
   * a still with a gradient in it, which is the case that bands.
   */
  dither: boolean
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

// JPEG (James, 2026-08-31). The rule this default answers to has not changed —
// it must be the format that opens everywhere — but PNG was satisfying that
// rule while breaking the action itself. The ordinary path is drop photos,
// press Convert, and against a JPEG source PNG made the file BIGGER: measured
// at +338% on a noise JPEG, reported honestly by the amber chip and still the
// wrong thing to have happened by default. Growth is not a sane default
// outcome of the most common action in a converter.
//
// ⚠️ WebP was the other candidate and was NOT chosen. It is the better file on
// every axis that can be measured — smaller than JPEG at equal quality, and it
// keeps alpha — but it fails the one rule above: it is still the format that
// gets emailed back with "I can't open this". JPEG is one click from WebP for
// anyone who knows they want it, and the chip's blurb says what it is for.
//
// ⚠️ The cost of JPEG, and why it did not sink it: JPEG has NO ALPHA, so
// `image.ts` fills white behind the image before encoding. That is a real loss
// and, unlike PNG's growth, an invisible one — nothing about a flattened logo
// looks wrong until you put it on a coloured background. It is not left
// silent: `ImageStudio` samples every dropped image for transparency and puts
// an amber line above the button when a see-through file is about to be
// flattened, in the same place and the same voice as the animated-GIF warning
// beside it. A loud loss was judged better than a loud growth; a SILENT loss
// would have been worse than either, which is the whole reason that warning is
// part of this change rather than a follow-up.
export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  format: 'jpeg',
  quality: 0.82,
  maxEdge: 'source',
  dither: false,
}
