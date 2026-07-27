import { useConverterStore } from '../../stores/converterStore'

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
export default function AppMenu() {
  const items = useConverterStore((s) => s.items)
  const running = useConverterStore((s) => s.running)
  const clearQueue = useConverterStore((s) => s.clearQueue)
  const resetSettings = useConverterStore((s) => s.resetSettings)

  return (
    <>
      <MenuRow
        icon="🧹"
        label="Clear the queue"
        disabled={running || items.length === 0}
        onClick={clearQueue}
      />
      <MenuRow
        icon="↩️"
        label="Reset output settings"
        disabled={running}
        onClick={resetSettings}
      />
    </>
  )
}

function MenuRow({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: string
  label: string
  disabled: boolean
  onClick: () => void
}) {
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
        background:     'transparent',
        color:          disabled ? '#94a3b8' : '#374151',
        cursor:         disabled ? 'default' : 'pointer',
        transition:     'background 120ms, color 120ms',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.background = '#fff7ed'
        e.currentTarget.style.color = '#c2410c'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = disabled ? '#94a3b8' : '#374151'
      }}
    >
      <span aria-hidden>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  )
}
