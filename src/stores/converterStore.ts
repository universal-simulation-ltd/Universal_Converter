import { create } from 'zustand'
import { convertAudio } from '../lib/convert'
import { convertDocument, DEFAULT_DOC_SETTINGS, type DocSettings } from '../lib/doc'
import { saveBlob } from '../lib/download'
import { extensionOf, formatDuration } from '../lib/humanise'
import { acceptsOn, kindOf, unsupportedMessage } from '../lib/formats'
import { convertImage, probeDimensions } from '../lib/image'
import { convertVideo } from '@unisim/media'
import { probeDuration, probeVideo } from '../lib/probe'
import {
  DEFAULT_AUDIO_SETTINGS,
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_VIDEO_SETTINGS,
  type AudioSettings,
  type ImageSettings,
  type MediaKind,
  type QueueItem,
  type VideoSettings,
} from '../lib/types'
import { createZip } from '../lib/zip'

/**
 * Which tab is showing. NOT `MediaKind`, on purpose: `MediaKind` is also the
 * discriminator on every queue item, so widening it to fit an 'all' tab would
 * leak a fourth case into `QueueItem.kind`, `acceptsOn`, `convertAll` and
 * `downloadAll` — none of which have anything to convert for it. The All tab
 * owns no queue; it sorts a drop and hands each file to a real tab.
 */
export type TabId = MediaKind | 'all'

/** How many of each kind a drop was sorted into. */
export type SortedCounts = Record<MediaKind, number>

interface ConverterState {
  tab: TabId
  items: QueueItem[]
  audio: AudioSettings
  image: ImageSettings
  video: VideoSettings
  document: DocSettings
  /** True while a queue is running; the panel goes read-only. */
  running: boolean

  setTab: (tab: TabId) => void
  addFiles: (files: File[], kind: MediaKind) => void
  /**
   * Sort a mixed drop onto the right tabs and report what went where.
   *
   * Returns the counts rather than switching tab itself: the caller is the only
   * thing that knows whether the person is watching, and silently jumping them
   * to another tab mid-drop is how you lose track of what you just dropped.
   */
  addSorted: (files: File[]) => SortedCounts & { rejected: string[] }
  removeItem: (id: string) => void
  clearQueue: (kind?: MediaKind) => void
  updateAudio: (patch: Partial<AudioSettings>) => void
  updateImage: (patch: Partial<ImageSettings>) => void
  updateVideo: (patch: Partial<VideoSettings>) => void
  updateDocument: (patch: Partial<DocSettings>) => void
  resetSettings: () => void

  convertAll: (kind: MediaKind) => Promise<void>
  downloadItem: (id: string) => void
  downloadAll: (kind: MediaKind) => Promise<void>
}

/** Every kind, in tab order — the one list the sorting and clearing loops use. */
export const KINDS: readonly MediaKind[] = ['image', 'audio', 'video', 'document']

function newId(): string {
  return crypto.randomUUID()
}

export const useConverterStore = create<ConverterState>((set, get) => ({
  // The front door, not a converter: somebody arriving does not yet know
  // which of the four they need, and this tab is the one that answers that.
  tab: 'all',
  items: [],
  audio: DEFAULT_AUDIO_SETTINGS,
  image: DEFAULT_IMAGE_SETTINGS,
  video: DEFAULT_VIDEO_SETTINGS,
  document: DEFAULT_DOC_SETTINGS,
  running: false,

  setTab: (tab) => set({ tab }),

  // `kind` is the tab the files were dropped on: a PNG dropped on the audio tab
  // is refused there rather than silently converting as an image, so the queue
  // always matches the panel beside it.
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
      const probe =
        item.kind === 'audio'
          ? probeDuration(item.file).then((s) => (s == null ? null : formatDuration(s)))
          : item.kind === 'video'
            ? probeVideo(item.file)
            : probeDimensions(item.file)
      void probe.then((detail) => {
        set({ items: get().items.map((i) => (i.id === item.id ? { ...i, detail } : i)) })
      })
    }
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

  removeItem: (id) => set({ items: get().items.filter((i) => i.id !== id) }),

  clearQueue: (kind) =>
    set({ items: kind ? get().items.filter((i) => i.kind !== kind) : [] }),

  updateAudio: (patch) => set({ audio: { ...get().audio, ...patch } }),

  updateImage: (patch) => set({ image: { ...get().image, ...patch } }),

  updateVideo: (patch) => set({ video: { ...get().video, ...patch } }),

  updateDocument: (patch) => set({ document: { ...get().document, ...patch } }),

  resetSettings: () =>
    set({
      audio: DEFAULT_AUDIO_SETTINGS,
      image: DEFAULT_IMAGE_SETTINGS,
      video: DEFAULT_VIDEO_SETTINGS,
      document: DEFAULT_DOC_SETTINGS,
    }),

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
                ? await convertVideo(item.file, get().video, onProgress)
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
    } finally {
      set({ running: false })
    }
  },

  downloadItem: (id) => {
    const item = get().items.find((i) => i.id === id)
    if (item?.result) saveBlob(item.result.blob, item.result.name)
  },

  downloadAll: async (kind) => {
    const done = get().items.filter((i) => i.kind === kind && i.result)
    if (done.length === 0) return
    const zip = await createZip(done.map((i) => ({ name: i.result!.name, blob: i.result!.blob })))
    const folder: Record<MediaKind, string> = {
      image: 'images', audio: 'audio', video: 'video', document: 'files',
    }
    saveBlob(zip, `converted-${folder[kind]}.zip`)
  },
}))
