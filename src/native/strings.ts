import { translateNav, useLanguage } from '@unisim/sdk'
import { APP_STRINGS } from './appStrings'

// The phone chrome's own words, in every suite language. Words the SDK already
// translates (Tune this app, Language, Colour scheme, Reset to defaults, the
// knowledge base's Previous / Next / Research and sources, About's sections)
// are read from the SDK through `translateNav`, so the phone says them exactly
// as the website's dialogs do. `appStrings.ts` holds this app's own rows.

type Lang = 'en' | 'fr' | 'es' | 'it' | 'de' | 'pt-BR' | 'pt-PT' | 'tr'
export type Dict = Record<Lang, Record<string, string>>

const CHROME: Dict = {
  en: {
    more: 'More',
    back: 'Back',
    search: 'Search the guides',
    no_match: 'Nothing matches “{q}”.',
    ok: 'OK',
    system: 'Match my device',
    privacy_policy: 'Privacy policy',
    made_by: 'Made by {designer} and {team}.',
  },
  fr: {
    more: 'Plus',
    back: 'Retour',
    search: 'Rechercher dans les guides',
    no_match: 'Aucun résultat pour « {q} ».',
    ok: 'OK',
    system: 'Comme l’appareil',
    privacy_policy: 'Politique de confidentialité',
    made_by: 'Créée par {designer} et {team}.',
  },
  es: {
    more: 'Más',
    back: 'Atrás',
    search: 'Buscar en las guías',
    no_match: 'Nada coincide con «{q}».',
    ok: 'Aceptar',
    system: 'Como el dispositivo',
    privacy_policy: 'Política de privacidad',
    made_by: 'Creada por {designer} y {team}.',
  },
  it: {
    more: 'Altro',
    back: 'Indietro',
    search: 'Cerca nelle guide',
    no_match: 'Nessun risultato per «{q}».',
    ok: 'OK',
    system: 'Come il dispositivo',
    privacy_policy: 'Informativa sulla privacy',
    made_by: 'Realizzata da {designer} e {team}.',
  },
  de: {
    more: 'Mehr',
    back: 'Zurück',
    search: 'Anleitungen durchsuchen',
    no_match: 'Keine Treffer für „{q}“.',
    ok: 'OK',
    system: 'Wie das Gerät',
    privacy_policy: 'Datenschutzerklärung',
    made_by: 'Entwickelt von {designer} und {team}.',
  },
  'pt-BR': {
    more: 'Mais',
    back: 'Voltar',
    search: 'Pesquisar nos guias',
    no_match: 'Nada corresponde a “{q}”.',
    ok: 'OK',
    system: 'Igual ao aparelho',
    privacy_policy: 'Política de privacidade',
    made_by: 'Feito por {designer} e {team}.',
  },
  'pt-PT': {
    more: 'Mais',
    back: 'Voltar',
    search: 'Pesquisar nos guias',
    no_match: 'Nada corresponde a «{q}».',
    ok: 'OK',
    system: 'Igual ao dispositivo',
    privacy_policy: 'Política de privacidade',
    made_by: 'Feito por {designer} e {team}.',
  },
  tr: {
    more: 'Daha fazla',
    back: 'Geri',
    search: 'Rehberlerde ara',
    no_match: '“{q}” ile eşleşen bir şey yok.',
    ok: 'Tamam',
    system: 'Cihazla aynı',
    privacy_policy: 'Gizlilik politikası',
    made_by: '{designer} ve {team} tarafından yapıldı.',
  },
}

function langOf(language: string | null | undefined): Lang {
  if (!language || language.startsWith('en')) return 'en'
  return (language in CHROME ? language : 'en') as Lang
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

export type T = (key: string, vars?: Record<string, string | number>) => string

/**
 * `t('more')` for the chrome's own words, `t('app.clear')` for this app's
 * rows, `t('sdk:prefs.language')` for a word the SDK already translates.
 */
export function useNT(): T {
  const { language } = useLanguage()
  const lang = langOf(language)
  return (key, vars) => {
    if (key.startsWith('sdk:')) return fill(translateNav(language, key.slice(4)), vars)
    if (key.startsWith('app.')) {
      const k = key.slice(4)
      return fill(APP_STRINGS[lang][k] ?? APP_STRINGS.en[k] ?? k, vars)
    }
    return fill(CHROME[lang][key] ?? CHROME.en[key] ?? key, vars)
  }
}
