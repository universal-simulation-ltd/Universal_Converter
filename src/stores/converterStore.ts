import { create } from 'zustand'
import { convertAudio } from '../lib/convert'
import { saveBlob } from '../lib/download'
import { extensionOf, formatDuration } from '../lib/humanise'
import { kindOf, unsupportedMessage } from '../lib/formats'
import { convertImage, probeDimensions } from '../lib/image'
import { probeDuration } from '../lib/probe'
import {
  DEFAULT_AUDIO_SETTINGS,
  DEFAULT_IMAGE_SETTINGS,
  type AudioSettings,
  type ImageSettings,
  type MediaKind,
  type QueueItem,
} from '../lib/types'
import { createZip } from '../lib/zip'

export type StudioTab = MediaKind | 'video'

interface ConverterState {
  tab: StudioTab
  items: QueueItem[]
  audio: AudioSettings
  image: ImageSettings
  /** True while a queue is running; the panel goes read-only. */
  running: boolean

  setTab: (tab: StudioTab) => void
  addFiles: (files: File[], kind: MediaKind) => void
  removeItem: (id: string) => void
  clearQueue: (kind?: MediaKind) => void
  updateAudio: (patch: Partial<AudioSettings>) => void
  updateImage: (patch: Partial<ImageSettings>) => void
  resetSettings: () => void

  convertAll: (kind: MediaKind) => Promise<void>
  downloadItem: (id: string) => void
  downloadAll: (kind: MediaKind) => Promise<void>
}

function newId(): string {
  return crypto.randomUUID()
}

export const useConverterStore = create<ConverterState>((set, get) => ({
  tab: 'audio',
  items: [],
  audio: DEFAULT_AUDIO_SETTINGS,
  image: DEFAULT_IMAGE_SETTINGS,
  running: false,

  setTab: (tab) => set({ tab }),

  // `kind` is the tab the files were dropped on: a PNG dropped on the audio tab
  // is refused there rather than silently converting as an image, so the queue
  // always matches the panel beside it.
  addFiles: (files, kind) => {
    const added: QueueItem[] = files.map((file) => {
      const ext = extensionOf(file.name)
      const supported = kindOf(ext) === kind
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
      }
    })
    set({ items: [...get().items, ...added] })

    // Duration / dimensions arrive asynchronously and only affect the row's
    // subtitle, so they never hold up the queue.
    for (const item of added) {
      if (item.status === 'unsupported') continue
      const probe =
        item.kind === 'audio'
          ? probeDuration(item.file).then((s) => (s == null ? null : formatDuration(s)))
          : probeDimensions(item.file)
      void probe.then((detail) => {
        set({ items: get().items.map((i) => (i.id === item.id ? { ...i, detail } : i)) })
      })
    }
  },

  removeItem: (id) => set({ items: get().items.filter((i) => i.id !== id) }),

  clearQueue: (kind) =>
    set({ items: kind ? get().items.filter((i) => i.kind !== kind) : [] }),

  updateAudio: (patch) => set({ audio: { ...get().audio, ...patch } }),

  updateImage: (patch) => set({ image: { ...get().image, ...patch } }),

  resetSettings: () => set({ audio: DEFAULT_AUDIO_SETTINGS, image: DEFAULT_IMAGE_SETTINGS }),

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
        patch(id, { status: 'converting', progress: 0, error: null })
        try {
          const onProgress = (fraction: number) => patch(id, { progress: fraction })
          const result =
            kind === 'audio'
              ? await convertAudio(item.file, get().audio, onProgress)
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
    saveBlob(zip, kind === 'audio' ? 'converted-audio.zip' : 'converted-images.zip')
  },
}))
