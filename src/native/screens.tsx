import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BottomSheet,
  LANGUAGE_LABELS,
  PhoneDialogHost,
  PhonePage,
  PrivacyNote,
  SUPPORTED_LANGUAGES,
  UniversalBar,
  parseArticleBody,
  phoneConfirm,
  useLanguage,
  useResetAppDefaults,
  type AboutAppConfig,
  type Language,
  type ThemeStore,
} from '@unisim/sdk'
import { Card, CardLabel, Row } from './parts'
import { usePhoneNav } from './nav'
import { useNT } from './strings'

// The phone chrome shared by every screen: the bar at the top (the suite's
// light bar, the app's mark and name, and ⋯), the ⋯ sheet, and the pages the
// website keeps in its navbar's dropdowns and dialogs — Tune this app, the
// guides (the knowledge base) and About — each a page of its own.

export interface PhoneAppInfo {
  name: string
  logo: ReactNode
  about: AboutAppConfig
  /** The app's colour scheme (Tune this app's three rows are bound to it). */
  themeStore: ThemeStore
  /** The guides, in the reader's language. */
  loadArticles: (language: string) => Promise<GuideArticle[]>
}

export interface GuideArticle {
  id: string
  title: string
  summary?: string
  group?: string
  body: string
  sources?: { kind: string; title: string; authors?: string; publisher?: string; year?: number; href: string }[]
}

const SUPPORT_EMAIL = 'inbox@unisim.co.uk'
const DESIGNER_HREF = 'https://www.jamesmarkey.co.uk'
const TEAM_HREF = 'https://www.unisim.co.uk'

/**
 * The top of the phone app, in place of the website's navbar: no dropdowns, no
 * suite switcher, no sign-in. `left` replaces the mark and name (Images'
 * editor puts its image count there); `centre` holds quick actions.
 */
export function PhoneBar({ app, left, centre }: { app: PhoneAppInfo; left?: ReactNode; centre?: ReactNode }) {
  const t = useNT()
  const openMore = usePhoneNav((s) => s.openMore)
  return (
    <header
      className="sticky top-0 z-[900] shrink-0 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <UniversalBar />
      <div className="flex min-h-[52px] items-center gap-2 pl-4 pr-1.5">
        {left ?? (
          <span className="flex min-w-0 items-center gap-2">
            {app.logo}
            <span className="truncate text-[17px] font-semibold text-slate-900 dark:text-slate-100">{app.name}</span>
          </span>
        )}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">{centre}</div>
        <button
          type="button"
          onClick={openMore}
          aria-label={t('more')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-700 active:bg-slate-100 dark:text-slate-200 dark:active:bg-slate-800"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      </div>
    </header>
  )
}

/**
 * Everything the chrome can open. `actions` are this app's own rows for the
 * top of the ⋯ sheet; `pages` its own pages, keyed by name.
 */
export function PhoneLayers({
  app,
  actions,
  tuneExtra,
  onReset,
  pages = {},
}: {
  app: PhoneAppInfo
  actions?: ReactNode
  tuneExtra?: ReactNode
  /** This app's half of Reset to defaults; undefined while it can't run. */
  onReset?: () => void
  pages?: Record<string, ReactNode>
}) {
  const t = useNT()
  const more = usePhoneNav((s) => s.more)
  const stack = usePhoneNav((s) => s.pages)
  const { closeMore, push, pop } = usePhoneNav.getState()

  return (
    <>
      {more && (
        <BottomSheet label={t('more')} onClose={closeMore}>
          {actions && <Card>{actions}</Card>}
          <Card>
            <Row icon="⚙️" label={t('sdk:prefs.app_preferences')} onClick={() => push('tune')} />
            <Row icon="📖" label={t('sdk:menu.knowledge_base')} onClick={() => push('kb')} />
            <Row icon="ℹ️" label={t('sdk:menu.about_app')} onClick={() => push('about')} />
          </Card>
        </BottomSheet>
      )}
      {stack.map((p) => (
        <Fragment key={p}>
          {p === 'tune' && (
            <TunePage app={app} themeStore={app.themeStore} extra={tuneExtra} onReset={onReset} onBack={() => pop('tune')} />
          )}
          {p === 'kb' && <KnowledgePage app={app} onBack={() => pop('kb')} />}
          {p === 'article' && <ArticlePage app={app} onBack={() => pop('article')} />}
          {p === 'about' && <AboutPage app={app} onBack={() => pop('about')} />}
          {pages[p]}
        </Fragment>
      ))}
      <PhoneDialogHost />
    </>
  )
}

// ── Tune this app ───────────────────────────────────────────────────────────

function TunePage({
  app,
  themeStore,
  extra,
  onReset,
  onBack,
}: {
  app: PhoneAppInfo
  themeStore: ThemeStore
  extra?: ReactNode
  onReset?: () => void
  onBack: () => void
}) {
  const t = useNT()
  const { language, setLanguage } = useLanguage()
  const pref = themeStore((s) => s.pref)
  const setOverride = themeStore((s) => s.setOverride)
  const reset = useResetAppDefaults(onReset, themeStore)
  const [done, setDone] = useState(false)
  const languageId = useId()
  const push = usePhoneNav((s) => s.push)

  useEffect(() => {
    if (!done) return
    const id = window.setTimeout(() => setDone(false), 2600)
    return () => window.clearTimeout(id)
  }, [done])

  const schemes = [
    { value: 'light', label: t('sdk:prefs.light') },
    { value: 'dark', label: t('sdk:prefs.dark') },
    { value: 'system', label: t('system') },
  ] as const

  return (
    <PhonePage title={t('sdk:prefs.app_preferences')} onBack={onBack}>
      <div className="flex flex-col gap-3 px-4 pt-4">
        {extra && <Card>{extra}</Card>}

        <CardLabel>{t('sdk:prefs.color_scheme')}</CardLabel>
        <Card>
          <div role="radiogroup" aria-label={t('sdk:prefs.color_scheme')} className="divide-y divide-slate-100 dark:divide-slate-800">
            {schemes.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={pref === s.value}
                onClick={() => setOverride(s.value)}
                className="flex w-full min-h-[52px] items-center gap-3 px-4 text-left text-[16px] active:bg-slate-100 dark:active:bg-slate-800"
              >
                <span className="flex-1">{s.label}</span>
                {pref === s.value && (
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-orange-700 dark:text-orange-400" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          {/* The system's own picker: a real <select> laid over the row. */}
          <label htmlFor={languageId} className="relative flex w-full min-h-[52px] items-center gap-3 px-4">
            <span className="flex-1 text-[16px]">{t('sdk:prefs.language')}</span>
            <span className="text-[15px] text-slate-500 dark:text-slate-400">{LANGUAGE_LABELS[language as Language]}</span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
            <select
              id={languageId}
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="absolute inset-0 h-full w-full opacity-0"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>
              ))}
            </select>
          </label>
          <Row label={t('sdk:menu.knowledge_base')} onClick={() => push('kb')} />
          <Row label={t('sdk:menu.about_app')} onClick={() => push('about')} />
        </Card>

        <button
          type="button"
          disabled={!onReset}
          onClick={async () => {
            if (await phoneConfirm({ message: t('sdk:prefs.reset_confirm', { app: app.name }), confirmLabel: t('sdk:prefs.reset_yes'), danger: true })) {
              reset()
              setDone(true)
            }
          }}
          className="min-h-[50px] rounded-2xl border border-slate-200 bg-white text-[16px] text-red-700 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-red-400"
        >
          {t('sdk:prefs.reset_defaults')}
        </button>
        <p role="status" className="min-h-[20px] text-center text-[14px] text-emerald-700 dark:text-emerald-400">
          {done ? t('sdk:prefs.reset_done') : ''}
        </p>
      </div>
    </PhonePage>
  )
}

// ── The guides (the knowledge base) ─────────────────────────────────────────

type Loaded = { lang: string; list: GuideArticle[] } | 'failed' | null

/** Accents and case away, so "resume" finds "résumé". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i')
}

function useArticles(app: PhoneAppInfo): Loaded {
  const { language } = useLanguage()
  const [loaded, setLoaded] = useState<Loaded>(null)
  useEffect(() => {
    let live = true
    app.loadArticles(language)
      .then((list) => live && setLoaded({ lang: language, list }))
      .catch(() => live && setLoaded('failed'))
    return () => {
      live = false
    }
  }, [app, language])
  return loaded
}

function KnowledgePage({ app, onBack }: { app: PhoneAppInfo; onBack: () => void }) {
  const t = useNT()
  const loaded = useArticles(app)
  const [query, setQuery] = useState('')
  const readArticle = usePhoneNav((s) => s.readArticle)
  const list = loaded && loaded !== 'failed' ? loaded.list : null

  // Every word of the search somewhere in the guide; groups keep their order.
  const runs = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean)
    const shown = (list ?? []).filter((a) => {
      if (!words.length) return true
      const hay = fold([a.title, a.summary, a.group, a.body].filter(Boolean).join(' '))
      return words.every((w) => hay.includes(w))
    })
    const out: { group?: string; items: GuideArticle[] }[] = []
    for (const a of shown) {
      const last = out[out.length - 1]
      if (last && last.group === a.group) last.items.push(a)
      else out.push({ group: a.group, items: [a] })
    }
    return out
  }, [list, query])

  return (
    <PhonePage title={t('sdk:menu.knowledge_base')} onBack={onBack}>
      <div className="flex flex-col gap-3 px-4 pt-4">
        <p className="px-1 text-[15px] leading-snug text-slate-600 dark:text-slate-300">{t('sdk:kb.intro', { app: app.name })}</p>
        {/* Never focused for the reader: a pull down from the top puts the finger here. */}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          aria-label={t('search')}
          className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white px-4 text-[16px] outline-none focus:border-orange-500 dark:border-slate-700 dark:bg-slate-900"
        />
        {loaded === null && <p className="px-1 text-[15px] text-slate-500">{t('sdk:kb.loading')}</p>}
        {loaded === 'failed' && <p className="px-1 text-[15px] text-red-700 dark:text-red-400">{t('sdk:kb.load_failed')}</p>}
        {list && runs.length === 0 && (
          <p className="px-1 text-[15px] text-slate-500">{t('no_match', { q: query.trim() })}</p>
        )}
        {runs.map((run, i) => (
          <Fragment key={`${run.group ?? ''}-${i}`}>
            {run.group && <CardLabel>{run.group}</CardLabel>}
            <Card>
              {run.items.map((a) => (
                <Row key={a.id} label={a.title} sub={a.summary} onClick={() => readArticle(a.id)} />
              ))}
            </Card>
          </Fragment>
        ))}
      </div>
    </PhonePage>
  )
}

/** `**bold**` inside a line, as the SDK's dialog draws it; nothing else is markup. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') && p.length > 4 ? (
          <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">{p.slice(2, -2)}</strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}

function ArticlePage({ app, onBack }: { app: PhoneAppInfo; onBack: () => void }) {
  const t = useNT()
  const loaded = useArticles(app)
  const id = usePhoneNav((s) => s.article)
  const list = loaded && loaded !== 'failed' ? loaded.list : []
  const at = list.findIndex((a) => a.id === id)
  const article = at >= 0 ? list[at] : null
  const bodyRef = useRef<HTMLDivElement>(null)
  const go = (i: number) => {
    const next = list[i]
    if (!next) return
    usePhoneNav.setState({ article: next.id })
    bodyRef.current?.scrollTo({ top: 0 })
  }

  return (
    <PhonePage title={article?.title ?? t('sdk:menu.knowledge_base')} onBack={onBack} bodyRef={bodyRef}>
      {article && (
        <article className="flex flex-col gap-3 px-5 pt-5 text-[16px] leading-relaxed text-slate-700 dark:text-slate-300">
          <h2 className="text-[24px] font-bold leading-tight text-slate-900 dark:text-slate-100">{article.title}</h2>
          {parseArticleBody(article.body).map((b, i) =>
            b.kind === 'h' ? (
              <h3 key={i} className="pt-2 text-[18px] font-semibold text-slate-900 dark:text-slate-100"><Inline text={b.text} /></h3>
            ) : b.kind === 'p' ? (
              <p key={i}><Inline text={b.text} /></p>
            ) : b.kind === 'ul' ? (
              <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>
            ) : (
              <ol key={i} className="list-decimal space-y-1 pl-5">{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ol>
            ),
          )}
          {article.sources && article.sources.length > 0 && (
            <>
              <h3 className="pt-3 text-[18px] font-semibold text-slate-900 dark:text-slate-100">{t('sdk:kb.sources')}</h3>
              <ul className="flex flex-col gap-2">
                {article.sources.map((s) => (
                  <li key={s.href} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] leading-snug dark:border-slate-800 dark:bg-slate-900">
                    <a href={s.href} target="_blank" rel="noopener noreferrer" className="font-medium text-orange-700 dark:text-orange-400">{s.title}</a>
                    <span className="block text-slate-500 dark:text-slate-400">
                      {[s.authors, s.publisher, s.year].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex gap-2 pt-3">
            <button
              type="button"
              disabled={at <= 0}
              onClick={() => go(at - 1)}
              className="min-h-[46px] flex-1 rounded-xl border border-slate-200 bg-white text-[15px] disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900"
            >
              ‹ {t('sdk:kb.previous')}
            </button>
            <button
              type="button"
              disabled={at < 0 || at >= list.length - 1}
              onClick={() => go(at + 1)}
              className="min-h-[46px] flex-1 rounded-xl border border-slate-200 bg-white text-[15px] disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900"
            >
              {t('sdk:kb.next')} ›
            </button>
          </div>
        </article>
      )}
    </PhonePage>
  )
}

// ── About this app ──────────────────────────────────────────────────────────

function AboutPage({ app, onBack }: { app: PhoneAppInfo; onBack: () => void }) {
  const t = useNT()
  const { language } = useLanguage()
  const theme = app.themeStore((s) => s.effective)
  const a = app.about
  const ships = (a.credits?.ships ?? []).filter((c) => c.name && (c.repo || c.authors?.length))
  const repo = a.repo ?? null
  const link = 'font-medium text-orange-700 dark:text-orange-400'
  const section = 'flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-[15px] leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
  const heading = 'text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'

  return (
    <PhonePage title={t('sdk:menu.about_app')} onBack={onBack}>
      <div className="flex flex-col gap-3 px-4 pt-5">
        <div className="flex items-center gap-3 px-1">
          <span className="scale-150 origin-left">{app.logo}</span>
          <h2 className="pl-3 text-[24px] font-bold text-slate-900 dark:text-slate-100">{app.name}</h2>
        </div>

        <section className={section}>
          <h3 className={heading}>{t('sdk:about.what_it_does')}</h3>
          <p>{t('app.what_it_does')}</p>
        </section>

        {(a.proof || repo) && (
          <section className={section}>
            <h3 className={heading}>{t('sdk:about.privacy')}</h3>
            <PrivacyNote
              dismissible={false}
              theme={theme}
              language={language}
              repo={(a.proof || repo) as string}
              proof={a.proof}
              subject={a.subject}
              plural={a.plural}
            />
          </section>
        )}

        {repo && (
          <section className={section}>
            <h3 className={heading}>{t('sdk:about.open_source')}</h3>
            <p>{t('sdk:about.open_source_body', { licence: 'MIT' })}</p>
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              <a href={repo} target="_blank" rel="noopener noreferrer" className={link}>{t('sdk:about.view_source')}</a>
              <a href={`${repo.replace(/\/+$/, '')}/issues`} target="_blank" rel="noopener noreferrer" className={link}>{t('sdk:about.report_problem')}</a>
            </p>
          </section>
        )}

        {ships.length > 0 && (
          <section className={section}>
            <h3 className={heading}>{t('sdk:about.built_with')}</h3>
            <p>{t('sdk:about.built_with_body')}</p>
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {ships.map((c) => (
                <li key={c.name} className="py-2">
                  {c.repo ? (
                    <a href={c.repo} target="_blank" rel="noopener noreferrer" className={link}>{c.title ?? c.name}</a>
                  ) : (
                    <span className="font-medium">{c.title ?? c.name}</span>
                  )}
                  {c.licence && <span className="ml-2 text-[13px] text-slate-500">{c.licence}</span>}
                  {c.authors?.length ? (
                    <span className="block text-[13px] text-slate-500 dark:text-slate-400">
                      {c.authors.slice(0, 2).join(', ')} et al.
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {a.noticesHref && (
              <a href={a.noticesHref} target="_blank" rel="noopener noreferrer" className={link}>
                {t('sdk:about.all_packages', { count: a.credits?.noticesCount ?? ships.length })}
              </a>
            )}
          </section>
        )}

        <section className={section}>
          <h3 className={heading}>{t('sdk:about.support')}</h3>
          <p>{t('sdk:about.support_body')}</p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className={link}>{SUPPORT_EMAIL}</a>
        </section>

        <p className="px-1 pt-1 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
          {t('made_by', { designer: '\u0000', team: '\u0001' })
            .split(/([\u0000\u0001])/)
            .map((part, i) =>
              part === '\u0000' ? (
                <a key={i} href={DESIGNER_HREF} target="_blank" rel="noopener noreferrer" className={link}>James Markey MBE</a>
              ) : part === '\u0001' ? (
                <a key={i} href={TEAM_HREF} target="_blank" rel="noopener noreferrer" className={link}>{t('sdk:about.the_team')}</a>
              ) : (
                <Fragment key={i}>{part}</Fragment>
              ),
            )}
        </p>
        {a.version && (
          <p className="px-1 text-[13px] tabular-nums text-slate-400">
            {t('sdk:about.version')} {a.version}
          </p>
        )}
      </div>
    </PhonePage>
  )
}
