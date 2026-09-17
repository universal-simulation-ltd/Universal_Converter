import { AdvancedMenu, MENU } from '@unisim/sdk'
// Generated — `npm run credits` after any dependency change. Never edit it by
// hand: it is read off the installed tree, so a hand-kept list drifts from the
// lockfile the first time anyone upgrades anything, and a credits list naming a
// package we removed is worse than no list at all.
import credits from '../../generated/credits.json'
import { useConverterStore } from '../../stores/converterStore'
import { useThemeStore } from '../../stores/themeStore'

// The per-app actions that slot into <UniversalAppsNavBar />'s `actions` prop —
// ROWS ONLY, no trigger and no panel of its own. The SDK renders them inside
// the merged profile pill, so the bar carries one dropdown on the right rather
// than an Actions button on the left and an avatar on the right.
//
// This is also what fixed the menu running off a phone screen: the old version
// owned an `absolute left-0 w-60` panel, which on a 393px viewport put half of
// "Reset output settings" past the right edge. The SDK's dropdown surface is
// positioned against the live viewport and capped to it, so it can't.
//
// Styling is inline rather than Tailwind to match the SDK dropdown's own rows
// (the same 8px/14px rhythm and 13px label the profile and language rows use) —
// these render inside SDK chrome, not ours.
//
// ⚠️ The SDK themes its own rows from the `theme` prop but CANNOT theme these —
// they are ours. So the colours below come in two columns: `light` is exactly
// what these rows have always rendered, and `dark` is the SDK's own `MENU.dark`
// palette, so the rows match the panel they sit in. Adding a colour? Add both.
//
// The Appearance rows (Light / Dark / Match my device) that used to be here
// are gone since SDK 0.143: colour scheme is a Global preference now, and this
// app's override of it is the Colour scheme row in the SDK's App preferences
// dialog, offered because App.tsx passes `themeStore` to the navbar. Don't add
// them back — two controls for one setting, and only one can "follow global".
const ROW = {
  light: {
    rest: '#374151',
    disabled: '#94a3b8',
    hoverBg: '#fff7ed',
    hoverFg: '#c2410c',
  },
  dark: {
    rest: MENU.dark.body,
    disabled: MENU.dark.faint,
    hoverBg: MENU.dark.rowHover,
    hoverFg: MENU.dark.rowHoverText,
  },
} as const

type RowColours = (typeof ROW)['light' | 'dark']

export default function AppMenu() {
  const items = useConverterStore((s) => s.items)
  const running = useConverterStore((s) => s.running)
  const clearQueue = useConverterStore((s) => s.clearQueue)
  const resetSettings = useConverterStore((s) => s.resetSettings)
  const theme = useThemeStore((s) => s.effective)
  const c = ROW[theme]

  return (
    <>
      <MenuRow
        c={c}
        icon="🧹"
        label="Clear the queue"
        disabled={running || items.length === 0}
        onClick={clearQueue}
      />
      <MenuRow
        c={c}
        icon="↩️"
        label="Reset output settings"
        disabled={running}
        onClick={resetSettings}
      />

      {/* Advanced — the SDK's own category, so every app in the suite has one in
          the same place, and whatever goes in it next is one change rather than
          nineteen. "About this app" is always its last row.
          ⚠️ `theme` is the RESOLVED theme, the same one the nav bar gets —
          without it the category and the About dialog render light in a dark
          app. */}
      <AdvancedMenu
        theme={theme}
        about={{
          repo:    'https://github.com/universal-simulation-ltd/Universal_Converter',
          proof:   'https://github.com/universal-simulation-ltd/Universal_Converter/blob/main/PRIVACY.md',
          subject: 'Your files',
          plural:  true,
          version: __APP_VERSION__,
          credits,
          noticesHref: 'https://github.com/universal-simulation-ltd/Universal_Converter/blob/main/THIRD-PARTY-NOTICES.md',
        }}
      />
    </>
  )
}

function MenuRow({
  c,
  icon,
  label,
  onClick,
  disabled = false,
}: {
  c: RowColours
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  const restBg = 'transparent'
  const restFg = disabled ? c.disabled : c.rest
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            10,
        width:          '100%',
        padding:        '8px 14px',
        fontSize:       13,
        fontFamily:     'inherit',
        textAlign:      'left',
        border:         0,
        background:     restBg,
        color:          restFg,
        cursor:         disabled ? 'default' : 'pointer',
        transition:     'background 120ms, color 120ms',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.background = c.hoverBg
        e.currentTarget.style.color = c.hoverFg
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = restBg
        e.currentTarget.style.color = restFg
      }}
    >
      <span aria-hidden>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  )
}
