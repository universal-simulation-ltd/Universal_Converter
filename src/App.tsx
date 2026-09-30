import { DefaultViewSelect, UniversalAppsNavBar, UpdateNotice, type AboutAppConfig } from '@unisim/sdk'
// Generated — `npm run credits` after any dependency change. Never edit it by
// hand: it is read off the installed tree, so a hand-kept list drifts from the
// lockfile the first time anyone upgrades anything, and a credits list naming a
// package we removed is worse than no list at all.
import credits from './generated/credits.json'
import AppMenu from './components/Header/AppMenu'
import ProductLogo from './components/Header/ProductLogo'
import ConverterApp from './components/converter/ConverterApp'
import { CONTAINER } from './lib/layout'
import { useConverterStore } from './stores/converterStore'
import { useThemeStore } from './stores/themeStore'
import { useSystemBarsStyle } from './lib/systemBars'
import { KNOWLEDGE_BASE } from './knowledge'

const REPO_URL = 'https://github.com/universal-simulation-ltd/Universal_Converter'

// "About this app" — drawn by the SDK at the foot of "Tune this app" (SDK
// 0.161.0; it was the last row of Actions ▸ Advanced until 2026-09-27).
const ABOUT: AboutAppConfig = {
  repo:    REPO_URL,
  proof:   'https://github.com/universal-simulation-ltd/Universal_Converter/blob/main/PRIVACY.md',
  subject: 'Your files',
  plural:  true,
  version: __APP_VERSION__,
  credits,
  noticesHref: 'https://github.com/universal-simulation-ltd/Universal_Converter/blob/main/THIRD-PARTY-NOTICES.md',
}

export default function App() {
  // The RESOLVED theme ('system' already turned into light or dark) — what the
  // SDK's inline-styled chrome needs, since it cannot read the `.dark` class.
  const theme = useThemeStore((s) => s.effective)
  // The native status bar (its strip on Android, and the glyphs) follows it.
  useSystemBarsStyle(theme)
  const running = useConverterStore((s) => s.running)
  const resetSettings = useConverterStore((s) => s.resetSettings)

  return (
    // ⚠️ pt-[env(safe-area-inset-top)] is for the native (Capacitor) build, not
    // the web one. Capacitor runs the app in a FULL-SCREEN WKWebView, and
    // index.html asks for `viewport-fit=cover`, so without this the navbar
    // renders UNDERNEATH the status bar and Dynamic Island, which puts the
    // product name on the clock and the menu out of reach. In a browser the
    // inset is 0, so this is a no-op on web and on desktop. Universal PDF, QR
    // and Images all carry the same line.
    <div className="flex flex-col min-h-screen bg-slate-100 pt-[env(safe-area-inset-top)] dark:bg-slate-950">
      <UniversalAppsNavBar
        product="converter"
        productLogo={<ProductLogo />}
        productHomeHref={import.meta.env.BASE_URL}
        actions={<AppMenu />}
        theme={theme}
        // App preferences' Colour scheme row (Follow global / Light / Dark /
        // System) is bound to this store. With the menu's Appearance rows gone,
        // that row is where this app's own light/dark override is chosen.
        themeStore={useThemeStore}
        suiteSwitcherIconSrc={`${import.meta.env.BASE_URL}unisim-icon.png`}
        contentClassName={CONTAINER}
        // Actions ▸ Advanced ▸ Knowledge base (SDK 0.163.0): this app's own
        // articles, bundled from ./knowledge so they read offline.
        knowledgeBase={KNOWLEDGE_BASE}
        about={ABOUT}
        // The tab the app opens on — the twin of double-tapping a tab, for
        // anybody who cannot double-tap (James, 2026-09-30).
        appPreferences={
          <DefaultViewSelect
            id="tab"
            label="Opens on"
            fallback="all"
            views={[
              { value: 'all', label: 'All' },
              { value: 'audio', label: 'Audio' },
              { value: 'image', label: 'Images' },
              { value: 'video', label: 'Video' },
              { value: 'document', label: 'Files' },
            ]}
          />
        }
        // "Reset to defaults" (the output settings) at the foot of Tune this
        // app. The SDK's half of it forgets the "Opens on" tab by itself.
        // Withheld mid-conversion, as the old actions-menu row was disabled
        // then: swapping settings under a running batch re-arms items.
        onResetDefaults={running ? undefined : resetSettings}
      />

      {/* Renders nothing until this tab is genuinely running superseded code.
          See the SDK's useAppUpdate: an autoUpdate PWA hands the new worker
          control but leaves the running page on its old JavaScript. */}
      <div className={`${CONTAINER} pt-4 empty:hidden`}>
        <UpdateNotice />
      </div>

      <main className="flex-1">
        <ConverterApp />
      </main>

      {/* pb-[env(safe-area-inset-bottom)] keeps the last line of the page off
          the home indicator / gesture bar in the native build; 0 everywhere else. */}
      <footer className="border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900">
        <div className={`${CONTAINER} py-4 flex flex-row items-center gap-3 sm:gap-4 text-xs text-slate-500 dark:text-slate-400`}>
          <span>
            With{' '}
            <span aria-hidden="true" className="text-orange-600 dark:text-orange-400">&hearts;</span>
            <span className="sr-only">love</span>{' '}
            from{' '}
            <a href="https://www.unisim.co.uk" target="_blank" rel="noreferrer" className="text-slate-700 hover:text-orange-700 underline-offset-2 hover:underline dark:text-slate-200 dark:hover:text-orange-400">
              UNISIM.co.uk
            </a>
          </span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Universal Converter on GitHub"
            title="View source on GitHub"
            className="ml-auto shrink-0 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 transition-colors dark:text-slate-300 dark:hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
              <path d="M12 .5C5.65.5.5 5.65.5 12.02c0 5.09 3.29 9.4 7.86 10.92.57.1.78-.25.78-.55 0-.27-.01-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.36.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.18 1.82 1.18 3.08 0 4.42-2.69 5.39-5.26 5.68.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.21.66.79.55 4.57-1.52 7.86-5.83 7.86-10.92C23.5 5.65 18.35.5 12 .5z" />
            </svg>
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </footer>
    </div>
  )
}
