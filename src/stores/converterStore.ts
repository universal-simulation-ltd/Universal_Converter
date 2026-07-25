import { create } from 'zustand'
import { convertFile } from '../lib/convert'
import { saveBlob } from '../lib/download'
import { extensionOf } from '../lib/humanise'
import { isSupportedInput, unsupportedMessage } from '../lib/formats'
import { probeDuration } from '../lib/probe'
import { DEFAULT_SETTINGS, type OutputSettings, type QueueItem } from '../lib/types'
import { createZip } from '../lib/zip'

export type StudioTab = 'audio' | 'video'

interface ConverterState {
  tab: StudioTab
  items: QueueItem[]
  settings: OutputSettings
  /** True while the queue is running; the whole panel goes read-only. */
  running: boolean

  setTab: (tab: StudioTab) => void
  addFiles: (files: File[]) => void
  removeItem: (id: string) => void
  clearQueue: () => void
  updateSettings: (patch: Partial<OutputSettings>) => void
  resetSettings: () => void

  convertAll: () => Promise<void>
  downloadItem: (id: string) => void
  downloadAll: () => Promise<void>
}

function newId(): string {
  return crypto.randomUUID()
}

export const useConverterStore = create<ConverterState>((set, get) => ({
  tab: 'audio',
  items: [],
  settings: DEFAULT_SETTINGS,
  running: false,

  setTab: (tab) => set({ tab }),

  addFiles: (files) => {
    const added: QueueItem[] = files.map((file) => {
      const ext = extensionOf(file.name)
      const supported = isSupportedInput(ext)
      return {
        id: newId(),
        file,
        ext,
        status: supported ? 'queued' : 'unsupported',
        progress: 0,
        durationSec: null,
        error: supported ? null : unsupportedMessage(ext),
        result: null,
      }
    })
    set({ items: [...get().items, ...added] })

    // Durations arrive asynchronously and only affect the row's subtitle, so
    // they never hold up the queue.
    for (const item of added) {
      if (item.status === 'unsupported') continue
      void probeDuration(item.file).then((durationSec) => {
        set({ items: get().items.map((i) => (i.id === item.id ? { ...i, durationSec } : i)) })
      })
    }
  },

  removeItem: (id) => set({ items: get().items.filter((i) => i.id !== id) }),

  clearQueue: () => set({ items: [] }),

  updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),

  resetSettings: () => set({ settings: DEFAULT_SETTINGS }),

  convertAll: async () => {
    if (get().running) return
    const patch = (id: string, fields: Partial<QueueItem>) => {
      set({ items: get().items.map((i) => (i.id === id ? { ...i, ...fields } : i)) })
    }

    set({ running: true })
    try {
      // Snapshot the ids first: the queue can be added to while it runs, and a
      // pass should convert what was there when it started.
      const pending = get()
        .items.filter((i) => i.status === 'queued' || i.status === 'failed')
        .map((i) => i.id)

      for (const id of pending) {
        const item = get().items.find((i) => i.id === id)
        if (!item) continue // removed mid-run
        patch(id, { status: 'converting', progress: 0, error: null })
        try {
          const result = await convertFile(item.file, get().settings, (fraction) =>
            patch(id, { progress: fraction }),
          )
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

  downloadAll: async () => {
    const done = get().items.filter((i) => i.result)
    if (done.length === 0) return
    const zip = await createZip(done.map((i) => ({ name: i.result!.name, blob: i.result!.blob })))
    saveBlob(zip, 'converted-audio.zip')
  },
}))
