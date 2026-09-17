import { createThemeStore, type ThemePref } from '@unisim/sdk'

// The light/dark/system preference. The store itself lives in @unisim/sdk
// (createThemeStore, since 0.140.0) — this file only names the key. It opens
// LIGHT and stays light until the user chooses otherwise (the suite rule): a
// fresh profile on a laptop set to dark still gets the light app, and only an
// explicit Dark or System changes that.
//
// Since SDK 0.143 the key holds this app's OVERRIDE, chosen in App preferences
// (App.tsx passes this store to the navbar as `themeStore`). Absent — "Follow
// global" — the app uses the suite-wide colour scheme from Global preferences,
// `universal:color-scheme`, which is light until chosen.
//
// ⚠️ The key is every user's saved choice for this app. Renaming it silently
// puts them all back to following global.
//
// ⚠️ THE KEY IS WRITTEN TWICE — `index.html` holds the other copy, in the inline
// script that puts `.dark` on <html> before the first paint. They are held
// together by the "theme key" block in `scripts/selftest.mjs`, which fails
// `npm test` if the two ever drift.
export type { ThemePref }

export const useThemeStore = createThemeStore('unisim-converter-theme')
