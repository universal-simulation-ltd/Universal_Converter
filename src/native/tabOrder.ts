import { createSyncedSettings, normaliseTabOrder } from '@unisim/sdk'
import { TABS, type TabId } from '../stores/converterStore'

// The phone app's tab order (BRANDING.md ▸ "Tabs reorder: hold and drag"):
// hold a section tab on the docked bar and drag it, or use Tune this app ▸
// Tab order. Reset to defaults puts it back. The website keeps its own fixed
// order.
//
// Kept on this device and — signed in — on the account (James, 2026-10-30:
// "mobile app and web app settings in tune this app should be saved and
// synced to their account … Global rule"): an SDK synced store
// (`createSyncedSettings`, @unisim/sdk 0.232.0), carried to the account's
// `tune-app:converter` row, newest change wins. The order saved before
// (`converter:tab-order`, a bare array) is read once, so nobody loses theirs.

const LEGACY_KEY = 'converter:tab-order'

export interface ConverterTune {
  /** Every tab, in the order the phone's bar shows them. */
  tabOrder: TabId[]
}

export function normaliseConverterTune(raw: unknown): ConverterTune {
  const r = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof ConverterTune, unknown>>) : {}
  return { tabOrder: normaliseTabOrder(r.tabOrder ?? null, TABS) as TabId[] }
}

/** The bare array the order was kept as before. `undefined`: nothing to bring over. */
export function readLegacyTabOrder(storage: Pick<Storage, 'getItem'>): ConverterTune | undefined {
  try {
    const raw = storage.getItem(LEGACY_KEY)
    if (raw === null) return undefined
    return { tabOrder: JSON.parse(raw) as TabId[] }
  } catch {
    return undefined
  }
}

export const converterTune = createSyncedSettings<ConverterTune>('converter', { tabOrder: [...TABS] }, normaliseConverterTune, {
  legacy: () => readLegacyTabOrder(window.localStorage),
})

interface TabOrderState {
  order: TabId[]
  /** A new order, or null for the default one. */
  setOrder: (order: readonly TabId[] | null) => void
}

const setOrder = (order: readonly TabId[] | null) => converterTune.set({ tabOrder: order ? [...order] : [...TABS] })

function useTabOrderSlice<U>(selector: (s: TabOrderState) => U): U {
  return converterTune((s) => selector({ order: s.tabOrder, setOrder }))
}

/** The zustand-style view the phone bar and Tune use. */
export const useTabOrder = Object.assign(useTabOrderSlice, {
  getState: (): TabOrderState => ({ order: converterTune.getState().tabOrder, setOrder }),
})
