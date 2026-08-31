import { create } from 'zustand'
import { convertAudio } from '../lib/convert'
import { convertDocument, DEFAULT_DOC_SETTINGS, type DocSettings } from '../lib/doc'
import { saveBlob, saveBlobAs } from '../lib/download'
import { extensionOf, formatDuration } from '../lib/humanise'
import { acceptsOn, kindOf, unsupportedMessage } from '../lib/formats'
import { convertImage } from '../lib/image'
import { estimateImageBytes, sampleImage, type ImageSample } from '../lib/estimate'
import { convertVideo } from '@unisim/media'
import { probeDuration, probeVideo } from '../lib/probe'
import { convertVideoToGif } from '../lib/videogif'
import { tabAfterDrop, type TabId } from '../lib/routing'
import {
  DEFAULT_AUDIO_SETTINGS,
  DEFAULT_GIF_SETTINGS,
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_VIDEO_SETTINGS,
  type AudioSettings,
  type GifSettings,
  type ImageSettings,
  type MediaKind,
  type QueueItem,
  type VideoSettings,
  type VideoTarget,
} from '../lib/types'
import { createZip } from '@unisim/media'

// `TabId` and the rule for where a drop leaves you both live in `lib/routing`,
// so the rule can be tested without standing a store up. Re-exported here
// because every component that needs the type already imports from this file.
export type { TabId } from '../lib/routing'

/** How many of each kind a drop was sorted into. */
export type SortedCounts = Record<MediaKind, number>

interface ConverterState {
  tab: TabId
  items: QueueItem[]
  audio: AudioSettings
  image: ImageSettings
  video: VideoSettings
  /**
   * Which of the video tab's two targets is selected.
   *
   * Kept beside `video` rather than inside it because `VideoSettings` belongs to
   * @unisim/media and describes an H.264 encode — see the note on `VideoTarget`.
   * `video.trim` stays authoritative for BOTH targets: the trim fields in the
   * panel are one control, and switching MP4 ⇄ GIF must not lose the window
   * somebody typed.
   */
  videoTarget: VideoTarget
  gif: GifSettings
  document: DocSettings
  /** True while a queue is running; the panel goes read-only. */
  running: boolean

  setTab: (tab: TabId) => void
  addFiles: (files: File[], kind: MediaKind) => void
  /**
   * Sort a mixed drop onto the right tabs and report what went where.
   *
   * ⚠️ Queues only — it does NOT switch tab. `addDropped` is the one that
   * decides where you end up, and it is what the UI calls; this stays the plain
   * sorter so the sorting and the navigation can be reasoned about separately.
   */
  addSorted: (files: File[]) => SortedCounts & { rejected: string[] }
  /**
   * The one entry point for every drop and every file-picker choice: queue the
   * files, then put the person on the tab that shows what they now have.
   *
   * `on` is the tab the files were dropped on, which is both where they are
   * assumed to belong and where they stay if nothing better applies. The rule
   * itself is `tabAfterDrop` in `lib/routing` — see the cases spelled out there.
   */
  addDropped: (files: File[], on: TabId) => { rejected: string[] }
  removeItem: (id: string) => void
  clearQueue: (kind?: MediaKind) => void
  updateAudio: (patch: Partial<AudioSettings>) => void
  updateImage: (patch: Partial<ImageSettings>) => void
  updateVideo: (patch: Partial<VideoSettings>) => void
  setVideoTarget: (target: VideoTarget) => void
  updateGif: (patch: Partial<GifSettings>) => void
  updateDocument: (patch: Partial<DocSettings>) => void
  resetSettings: () => void

  convertAll: (kind: MediaKind) => Promise<void>
  downloadItem: (id: string) => void
  /** Save one finished row through the OS file dialog, where there is one. */
  saveItemAs: (id: string) => void
  downloadAll: (kind: MediaKind) => Promise<void>
}

/** Every kind, in tab order — the one list the sorting and clearing loops use. */
export const KINDS: readonly MediaKind[] = ['image', 'audio', 'video', 'document']

function newId(): string {
  return crypto.randomUUID()
}

/**
 * Put the converted rows of one kind back in the queue, so changing a setting
 * offers the conversion again instead of leaving a finished queue and a
 * "Convert 0 files" button.
 *
 * ⚠️ The RESULT is dropped along with the status, and that is the point. A row
 * that kept its old blob would sit there offering a Save button for a PNG while
 * the panel says JPEG, with the old format's size printed beside it — the two
 * most believable halves of a wrong answer. `notes` go too: they described the
 * conversion that is no longer there.
 *
 * ⚠️ Rows that FAILED are left exactly as they are. `convertAll` already
 * retries a failed row, so re-arming would only wipe the error message
 * explaining why it failed — which the person needs in order to choose the
 * setting that will work.
 */
/**
 * Tiles cut from each queued image, keyed by row id — the input to every size
 * estimate. Deliberately OUTSIDE the store: a canvas is not state anybody
 * renders, and putting one in a zustand slice would re-render the whole queue
 * every time a file finished being sampled.
 *
 * Cleared by `forgetSample` on remove and on clear, or the cache outlives the
 * queue and holds a canvas per file that has been gone for an hour.
 */
const samples = new Map<string, ImageSample>()

function forgetSample(id: string): void {
  samples.delete(id)
}

/**
 * Re-price every image row against the CURRENT settings.
 *
 * Cheap by construction: the expensive half — decoding the source — happened
 * once when the file was added, and this only re-encodes a 224px tile. That is
 * what makes it affordable to run on every quality nudge and format click.
 */
async function refreshEstimates(): Promise<void> {
  const store = useConverterStore.getState()
  const settings = store.image
  for (const item of store.items) {
    if (item.kind !== 'image') continue
    const sample = samples.get(item.id)
    if (!sample) continue
    let estimate: number | null = null
    try {
      estimate = await estimateImageBytes(sample, settings, item.frames ?? 1)
    } catch {
      // An estimate is a courtesy — a browser that will not encode a tile is
      // not a reason to paint the row red. It converts or it doesn't, and that
      // is what the Convert button is for.
      estimate = null
    }
    const live = useConverterStore.getState()
    // The settings may have moved on while this awaited; a stale number is
    // worse than none, so it is dropped rather than written.
    if (live.image !== settings) return
    useConverterStore.setState({
      items: live.items.map((i) => (i.id === item.id ? { ...i, estimate } : i)),
    })
  }
}

/**
 * Decode each new image once: it gives the row its dimensions AND leaves the
 * tile every later estimate is priced from.
 *
 * ⚠️ SEQUENTIAL, unlike the audio and video probes above. Those read a header;
 * this decodes whole pictures, and forty 12-megapixel photos decoded at once is
 * forty full-size bitmaps live at the same moment — which is how a tab runs out
 * of memory before it has converted anything.
 *
 * ⚠️ It also replaces `probeDimensions`, which asked an `<img>` for the size and
 * therefore returned NOTHING for a HEIC — the one format no browser will load
 * that way. HEIC rows had a blank where every other row had "4032 × 3024".
 * Getting the dimensions from the decoder that already handles HEIC fixes that
 * as a side effect of needing the pixels anyway.
 */
async function sampleAdded(items: QueueItem[]): Promise<void> {
  for (const item of items) {
    try {
      const sample = await sampleImage(item.file)
      // Null for everything that is not an animated GIF, which is almost
      // everything — and cheap to ask, because it scans the block headers
      // rather than decoding anything. See `probeGifFrames`.
      // ⚠️ Dynamic, and only for a file already named `.gif`. A static import
      // here would put the reader, the palette builder and the LZW coder into
      // the main bundle for everyone, undoing the split `image.ts` sets up.
      let frames: number | null = null
      if (item.ext === 'gif') {
        const { probeGifFrames } = await import('../lib/imagegif')
        frames = await probeGifFrames(item.file)
      }
      // Dropped from the queue while it decoded — do not resurrect the row, and
      // do not leave its tile in the cache.
      if (!useConverterStore.getState().items.some((i) => i.id === item.id)) continue
      samples.set(item.id, sample)
      useConverterStore.setState({
        items: useConverterStore.getState().items.map((i) =>
          i.id === item.id
            ? {
                ...i,
                detail: frames
                  ? `${sample.width} × ${sample.height} · ${frames} frames`
                  : `${sample.width} × ${sample.height}`,
                ...(frames ? { frames } : {}),
                // Free — the sample decode already read these pixels. Not put
                // in `detail`: "has transparency" is not a property anyone
                // wants printed on every PNG row, only one the panel needs to
                // know about when the target is JPEG.
                hasAlpha: sample.hasTransparency,
              }
            : i,
        ),
      })
    } catch {
      // A file that will not decode has no dimensions and no estimate. It is
      // NOT marked failed here: the row is still queued, and the conversion is
      // what gets to say so, with the decoder's own words.
      continue
    }
    await refreshEstimates()
  }
}

/**
 * One tab's finished rows put back in the queue — the results go with the
 * status, for the reason spelled out below.
 *
 * ⓘ There used to be a `requeueAll` action on the store calling this, behind
 * the action card's "Convert again" button. Both went on 2026-08-31 (James):
 * once a tab is finished the card shows no convert button at all, and the way
 * back is to change a setting, which re-arms through the paths below anyway.
 * Bring it back only with a caller — a store action nothing calls is a claim
 * about the UI that is no longer true.
 */
function rearmed(state: ConverterState, kind: MediaKind): QueueItem[] {
  // A run holds the panel read-only, so this should be unreachable mid-pass —
  // but a settings write landing during a conversion would reset the very row
  // being written to, so it is guarded rather than assumed.
  if (state.running) return state.items
  return state.items.map((i) =>
    i.kind === kind && i.status === 'done'
      ? { ...i, status: 'queued' as const, progress: 0, result: null, notes: [], savedAutomatically: false }
      : i,
  )
}

export const useConverterStore = create<ConverterState>((set, get) => ({
  // The front door, not a converter: somebody arriving does not yet know
  // which of the four they need, and this tab is the one that answers that.
  tab: 'all',
  items: [],
  audio: DEFAULT_AUDIO_SETTINGS,
  image: DEFAULT_IMAGE_SETTINGS,
  video: DEFAULT_VIDEO_SETTINGS,
  videoTarget: 'mp4',
  gif: DEFAULT_GIF_SETTINGS,
  document: DEFAULT_DOC_SETTINGS,
  running: false,

  setTab: (tab) => set({ tab }),

  // `kind` is the queue the files are going into, and everything that doesn't
  // belong in it is refused rather than silently converted as something else —
  // so the queue always matches the panel beside it.
  //
  // ⚠️ Which is NOT the same as "a PNG dropped on the Audio tab is refused".
  // Since 2026-08-30 the UI goes through `addDropped`, which sends a file the
  // dropped-on tab can't use to the tab that can, and then moves the person to
  // where they can see both. This function is the level below that decision.
  addFiles: (files, kind) => {
    const added: QueueItem[] = files.map((file) => {
      const ext = extensionOf(file.name)
      const supported = acceptsOn(ext, kind)
      return {
        id: newId(),
        file,
        kind,
        ext,
        status: supported ? 'queued' : 'unsupported',
        progress: 0,
        detail: null,
        error: supported ? null : unsupportedMessage(ext, kind),
        result: null,
        estimate: null,
        notes: [],
      }
    })
    set({ items: [...get().items, ...added] })

    // Duration / dimensions arrive asynchronously and only affect the row's
    // subtitle, so they never hold up the queue.
    for (const item of added) {
      if (item.status === 'unsupported') continue
      // ⚠️ Documents are skipped, and `detail` stays null for them. There is
      // nothing to probe that is worth opening the file for — a page count is
      // only knowable by doing the whole conversion — and the obvious filler,
      // the file size, is ALREADY the first thing on the row: putting it in
      // `detail` too printed it twice ("3 KB · 3 KB · → 10 KB").
      if (item.kind === 'document') continue
      if (item.kind === 'image') continue // sampled below, in one sequential pass
      const probe =
        item.kind === 'audio'
          ? probeDuration(item.file).then((s) => (s == null ? null : formatDuration(s)))
          : probeVideo(item.file)
      void probe.then((detail) => {
        set({ items: get().items.map((i) => (i.id === item.id ? { ...i, detail } : i)) })
      })
    }

    void sampleAdded(added.filter((i) => i.kind === 'image' && i.status === 'queued'))
  },

  addSorted: (files) => {
    const buckets: Record<MediaKind, File[]> = { audio: [], image: [], video: [], document: [] }
    const rejected: string[] = []
    for (const file of files) {
      const kind = kindOf(extensionOf(file.name), file.type)
      if (kind) buckets[kind].push(file)
      else rejected.push(file.name)
    }
    // One call per kind rather than per file: `addFiles` appends to one array,
    // so four calls are four renders and fifty files would be fifty.
    for (const kind of KINDS) {
      if (buckets[kind].length) get().addFiles(buckets[kind], kind)
    }
    return {
      audio: buckets.audio.length,
      image: buckets.image.length,
      video: buckets.video.length,
      document: buckets.document.length,
      rejected,
    }
  },

  addDropped: (files, on) => {
    // Read BEFORE anything is queued: "was the queue empty when they dropped
    // this?" is the question rule 1 in `tabAfterDrop` asks, and one `addFiles`
    // call from now the answer is always "no".
    const hadItems = get().items.length > 0
    // Which tabs actually got a row. Not the same as "which kinds were in the
    // drop": an MP4 dropped on the Audio tab lands on Audio, because that is
    // how you ask for a video's soundtrack.
    const landedOn: MediaKind[] = []
    let rejected: string[] = []

    if (on === 'all') {
      const sorted = get().addSorted(files)
      rejected = sorted.rejected
      for (const kind of KINDS) if (sorted[kind] > 0) landedOn.push(kind)
    } else {
      // On a studio tab, that tab is the answer for everything it can take —
      // and for everything NOTHING can take, which is how an unreadable file
      // still gets a row here saying why (`unsupportedMessage`) instead of
      // vanishing. Only a file this tab can't use but another one can moves.
      const mine: File[] = []
      const elsewhere: Record<MediaKind, File[]> = { audio: [], image: [], video: [], document: [] }
      for (const file of files) {
        const ext = extensionOf(file.name)
        if (acceptsOn(ext, on)) {
          mine.push(file)
          continue
        }
        const kind = kindOf(ext, file.type)
        if (kind && kind !== on) elsewhere[kind].push(file)
        else mine.push(file)
      }
      if (mine.length) {
        get().addFiles(mine, on)
        landedOn.push(on)
      }
      for (const kind of KINDS) {
        if (elsewhere[kind].length) {
          get().addFiles(elsewhere[kind], kind)
          landedOn.push(kind)
        }
      }
    }

    const next = tabAfterDrop({ from: on, hadItems, landedOn, rejected: rejected.length > 0 })
    if (next !== get().tab) set({ tab: next })
    return { rejected }
  },

  removeItem: (id) => {
    forgetSample(id)
    set({ items: get().items.filter((i) => i.id !== id) })
  },

  clearQueue: (kind) => {
    for (const i of get().items) if (!kind || i.kind === kind) forgetSample(i.id)
    set({ items: kind ? get().items.filter((i) => i.kind !== kind) : [] })
  },

  updateAudio: (patch) => {
    set({ audio: { ...get().audio, ...patch }, items: rearmed(get(), 'audio') })
  },

  updateImage: (patch) => {
    set({ image: { ...get().image, ...patch }, items: rearmed(get(), 'image') })
    void refreshEstimates()
  },

  updateVideo: (patch) => {
    set({ video: { ...get().video, ...patch }, items: rearmed(get(), 'video') })
  },

  setVideoTarget: (videoTarget) => set({ videoTarget, items: rearmed(get(), 'video') }),

  updateGif: (patch) => {
    set({ gif: { ...get().gif, ...patch }, items: rearmed(get(), 'video') })
  },

  updateDocument: (patch) => {
    set({ document: { ...get().document, ...patch }, items: rearmed(get(), 'document') })
  },

  resetSettings: () => {
    let items = get().items
    for (const kind of KINDS) items = rearmed({ ...get(), items }, kind)
    set({
      items,
      audio: DEFAULT_AUDIO_SETTINGS,
      image: DEFAULT_IMAGE_SETTINGS,
      video: DEFAULT_VIDEO_SETTINGS,
      videoTarget: 'mp4',
      gif: DEFAULT_GIF_SETTINGS,
      document: DEFAULT_DOC_SETTINGS,
    })
    void refreshEstimates()
  },

  convertAll: async (kind) => {
    if (get().running) return
    const patch = (id: string, fields: Partial<QueueItem>) => {
      set({ items: get().items.map((i) => (i.id === id ? { ...i, ...fields } : i)) })
    }

    set({ running: true })
    try {
      // Snapshot the ids first: the queue can be added to while it runs, and a
      // pass should convert what was there when it started.
      const pending = get()
        .items.filter((i) => i.kind === kind && (i.status === 'queued' || i.status === 'failed'))
        .map((i) => i.id)

      for (const id of pending) {
        const item = get().items.find((i) => i.id === id)
        if (!item) continue // removed mid-run
        patch(id, { status: 'converting', progress: 0, error: null, notes: [] })
        try {
          const onProgress = (fraction: number) => patch(id, { progress: fraction })
          if (kind === 'document') {
            const result = await convertDocument(item.file, get().document, onProgress)
            // The notices ride WITH the result rather than replacing it: the
            // file is good and downloadable, and the sentences say what it
            // could not carry across.
            patch(id, {
              status: 'done',
              progress: 1,
              result: { blob: result.blob, name: result.name },
              notes: result.notices.map((n) => n.message),
            })
            continue
          }
          const result =
            kind === 'audio'
              ? await convertAudio(item.file, get().audio, onProgress)
              : kind === 'video'
                ? get().videoTarget === 'gif'
                  // The trim comes from `video`, not from `gif` — one window for
                  // the tab, whichever target it is pointed at.
                  ? await convertVideoToGif(item.file, get().gif, get().video.trim, onProgress)
                  : await convertVideo(item.file, get().video, onProgress)
                : await convertImage(item.file, get().image, onProgress)
          patch(id, { status: 'done', progress: 1, result })
        } catch (err) {
          patch(id, {
            status: 'failed',
            progress: 0,
            error: err instanceof Error ? err.message : 'Conversion failed',
          })
        }
      }

      // One file in, one file out: the Save button after it carries no decision,
      // so the download starts itself. Deliberately ONLY for a queue of one —
      // a batch that saved itself would be a dozen downloads nobody asked for,
      // which is what "Download all as ZIP" is for. The row's Save button stays
      // put either way, so a second copy is always one click away.
      if (pending.length === 1) {
        const only = get().items.find((i) => i.id === pending[0])
        if (only?.result) {
          saveBlob(only.result.blob, only.result.name)
          // Recorded so the button below can offer a SECOND copy rather than
          // pretending to be the first. Before this, the file saved itself and
          // then a button reading "Download the converted file" sat under it —
          // pressing the obvious next control put an identical duplicate in the
          // downloads folder.
          patch(only.id, { savedAutomatically: true })
        }
      }
    } finally {
      set({ running: false })
    }
  },

  downloadItem: (id) => {
    const item = get().items.find((i) => i.id === id)
    if (item?.result) saveBlob(item.result.blob, item.result.name)
  },

  /**
   * Save one finished row wherever the user points the dialog.
   *
   * ⚠️ Synchronous down to `saveBlobAs`, which is synchronous down to
   * `showSaveFilePicker`. The picker needs the click's transient activation and
   * an `await` anywhere on this path spends it — so this reads the item out of
   * state rather than being handed a promise, and returns void rather than
   * awaiting anything.
   */
  saveItemAs: (id) => {
    const item = get().items.find((i) => i.id === id)
    if (item?.result) void saveBlobAs(item.result.blob, item.result.name)
  },

  downloadAll: async (kind) => {
    const done = get().items.filter((i) => i.kind === kind && i.result)
    if (done.length === 0) return
    // ⚠️ A queue of one is saved as the file itself, not as a ZIP of one — and
    // the button says "Download the converted file" when that is what it does.
    // A single-entry archive is a second step between somebody and the thing
    // they converted, for no gain.
    if (done.length === 1) return saveBlob(done[0].result!.blob, done[0].result!.name)
    const zip = await createZip(done.map((i) => ({ name: i.result!.name, blob: i.result!.blob })))
    const folder: Record<MediaKind, string> = {
      image: 'images', audio: 'audio', video: 'video', document: 'files',
    }
    saveBlob(zip, `converted-${folder[kind]}.zip`)
  },
}))

/** One tab's queue, added up — the numbers the circle and the action card read. */
export interface KindTotals {
  /** Rows this tab could convert: everything but the ones it can't open. */
  eligible: number
  /** Waiting to be converted, including the ones that failed and can be retried. */
  pending: number
  done: number
  failed: number
  bytesIn: number
  /** Source bytes of the rows that HAVE a result — the "was" the saving is against. */
  bytesInDone: number
  bytesOutDone: number
  /** 0–1 across the whole tab, so the ring can fill while a batch runs. */
  progress: number
}

/**
 * ⚠️ `bytesInDone`, not `bytesIn`, is what the saving is measured against.
 * Halfway through a batch the two are different numbers, and dividing the
 * output so far by the input of everything queued reports a saving of 60% on a
 * queue that has not saved anything yet.
 */
export function kindTotals(items: QueueItem[], kind: MediaKind): KindTotals {
  const mine = items.filter((i) => i.kind === kind)
  const eligible = mine.filter((i) => i.status !== 'unsupported')
  let bytesIn = 0
  let bytesInDone = 0
  let bytesOutDone = 0
  let progress = 0

  for (const i of eligible) {
    bytesIn += i.file.size
    progress += i.status === 'done' ? 1 : i.progress
    if (i.result) {
      bytesInDone += i.file.size
      bytesOutDone += i.result.blob.size
    }
  }

  return {
    eligible: eligible.length,
    pending: eligible.filter((i) => i.status === 'queued' || i.status === 'failed').length,
    done: eligible.filter((i) => i.status === 'done').length,
    failed: eligible.filter((i) => i.status === 'failed').length,
    bytesIn,
    bytesInDone,
    bytesOutDone,
    progress: eligible.length === 0 ? 0 : progress / eligible.length,
  }
}

/** How much smaller, as a whole percent. Negative when the new format is bigger. */
export function savingPercent(before: number, after: number): number {
  if (before <= 0) return 0
  return Math.round(((before - after) / before) * 100)
}
