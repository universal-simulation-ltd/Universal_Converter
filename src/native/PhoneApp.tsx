import { useId } from 'react'
import { useDefaultView } from '@unisim/sdk'
import ProductLogo from '../components/Header/ProductLogo'
import { loadArticles } from '../knowledge'
import { ABOUT } from '../lib/aboutApp'
import { TABS, useConverterStore, type TabId } from '../stores/converterStore'
import { useThemeStore } from '../stores/themeStore'
import { usePhoneNav } from './nav'
import { Row } from './parts'
import { PhoneBar, PhoneLayers, type PhoneAppInfo } from './screens'
import { useNT } from './strings'

// Universal Converter's phone chrome (iOS and Android). The website's navbar
// opened four popups here: the Actions dropdown (Clear the queue), Tune this
// app (with its "Opens on" dropdown), About and the knowledge base. On the
// phone the bar is the light bar, the mark and ⋯; ⋯ is a bottom sheet with
// Clear the queue, and Tune this app, the guides and About are pages. "Opens
// on" is the system's own picker.

const APP: PhoneAppInfo = {
  name: 'Universal Converter',
  logo: <ProductLogo />,
  about: ABOUT,
  themeStore: useThemeStore,
  loadArticles,
}

// The tabs' own names, as the tab row shows them.
const TAB_LABEL: Record<TabId, string> = {
  all: 'All',
  audio: 'Audio',
  image: 'Images',
  video: 'Video',
  document: 'Files',
}

export function ConverterPhoneBar() {
  return <PhoneBar app={APP} />
}

/** "Opens on": the twin of double-tapping a tab, as a row of Tune this app. */
function OpensOn() {
  const t = useNT()
  const id = useId()
  const dv = useDefaultView<TabId>('tab', 'all', { views: TABS })
  return (
    <label htmlFor={id} className="relative flex w-full min-h-[52px] items-center gap-3 px-4">
      <span className="flex-1 text-[16px]">{t('app.opens_on')}</span>
      <span className="text-[15px] text-slate-500 dark:text-slate-400">{TAB_LABEL[dv.defaultView]}</span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 5l7 7-7 7" />
      </svg>
      <select
        id={id}
        value={dv.defaultView}
        onChange={(e) => dv.setDefaultView(e.target.value === 'all' ? null : (e.target.value as TabId))}
        className="absolute inset-0 h-full w-full opacity-0"
      >
        {TABS.map((v) => (
          <option key={v} value={v}>{TAB_LABEL[v]}</option>
        ))}
      </select>
    </label>
  )
}

export function ConverterPhoneLayers() {
  const t = useNT()
  const items = useConverterStore((s) => s.items)
  const running = useConverterStore((s) => s.running)
  const clearQueue = useConverterStore((s) => s.clearQueue)
  const resetSettings = useConverterStore((s) => s.resetSettings)
  return (
    <PhoneLayers
      app={APP}
      actions={
        <Row
          icon="🧹"
          label={t('app.clear_queue')}
          chevron={false}
          disabled={running || items.length === 0}
          onClick={() => {
            usePhoneNav.getState().closeMore()
            clearQueue()
          }}
        />
      }
      tuneExtra={<OpensOn />}
      // Withheld mid-conversion, as on the website: swapping settings under a
      // running batch re-arms items.
      onReset={running ? undefined : resetSettings}
    />
  )
}
