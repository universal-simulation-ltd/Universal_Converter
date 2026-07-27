import { UniversalAppsNavBar } from '@unisim/sdk'
import AppMenu from './components/Header/AppMenu'
import ProductLogo from './components/Header/ProductLogo'
import ConverterApp from './components/converter/ConverterApp'
import { CONTAINER } from './lib/layout'

const REPO_URL = 'https://github.com/universal-simulation-ltd/Universal_Converter'

export default function App() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-100">
      <UniversalAppsNavBar
        product="converter"
        productLogo={<ProductLogo />}
        productHomeHref={import.meta.env.BASE_URL}
        actions={<AppMenu />}
        suiteSwitcherIconSrc={`${import.meta.env.BASE_URL}unisim-icon.png`}
        contentClassName={CONTAINER}
      />

      <main className="flex-1">
        <ConverterApp />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className={`${CONTAINER} py-4 flex flex-row items-center gap-3 sm:gap-4 text-xs text-slate-500`}>
          <span>
            100% free — every feature, no paywalls. Open source, hosted by{' '}
            <a
              href="https://www.unisim.co.uk"
              target="_blank"
              rel="noreferrer"
              className="text-slate-700 hover:text-orange-600 underline-offset-2 hover:underline"
            >
              UNI SIM
            </a>
          </span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Universal Converter on GitHub"
            title="View source on GitHub"
            className="ml-auto shrink-0 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 transition-colors"
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
