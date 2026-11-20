import { create } from 'zustand'
import { normaliseTabOrder } from '@unisim/sdk'
import { TABS, type TabId } from '../stores/converterStore'

// The phone app's tab order (BRANDING.md ▸ "Tabs reorder: hold and drag"):
// hold a section tab on the docked bar and drag it, or use Tune this app ▸
// Tab order. Reset to defaults puts it back. The website keeps its own fixed
// order. Kept on this device: the app has no backup file, and the account sync
// (SDK 0.229) carries only the SDK's own Tune rows so far.

const KEY = 'converter:tab-order'

function read(): TabId[] {
  try {
    const raw = localStorage.getItem(KEY)
    return normaliseTabOrder(raw ? (JSON.parse(raw) as string[]) : null, TABS) as TabId[]
  } catch {
    return [...TABS]
  }
}

interface TabOrderState {
  order: TabId[]
  /** A new order, or null for the default one. */
  setOrder: (order: readonly TabId[] | null) => void
}

export const useTabOrder = create<TabOrderState>((set) => ({
  order: read(),
  setOrder: (order) => {
    try {
      if (order) localStorage.setItem(KEY, JSON.stringify(order))
      else localStorage.removeItem(KEY)
    } catch {
      /* private mode: this session only */
    }
    set({ order: order ? [...order] : [...TABS] })
  },
}))
