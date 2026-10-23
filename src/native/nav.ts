import { create } from 'zustand'

// What the phone chrome has open: the ⋯ sheet, and the pages stacked over the
// app (Tune this app, the guides, About, and this app's own). Each layer
// registers its own Back step (the SDK's PhonePage and BottomSheet do), so
// this only holds the state.

interface PhoneNav {
  more: boolean
  pages: string[]
  /** The guide the 'article' page shows. */
  article: string | null
  openMore: () => void
  closeMore: () => void
  /** Open a page (from the ⋯ sheet: the sheet closes as it goes). */
  push: (page: string) => void
  /** Close `page` and anything stacked over it. */
  pop: (page: string) => void
  readArticle: (id: string) => void
}

export const usePhoneNav = create<PhoneNav>((set) => ({
  more: false,
  pages: [],
  article: null,
  openMore: () => set({ more: true }),
  closeMore: () => set({ more: false }),
  push: (page) => set((s) => ({ more: false, pages: s.pages.includes(page) ? s.pages : [...s.pages, page] })),
  pop: (page) =>
    set((s) => {
      const i = s.pages.lastIndexOf(page)
      return i < 0 ? s : { pages: s.pages.slice(0, i) }
    }),
  readArticle: (id) => set((s) => ({ article: id, pages: s.pages.includes('article') ? s.pages : [...s.pages, 'article'] })),
}))

export const isOpen = (pages: string[], page: string) => pages.includes(page)
