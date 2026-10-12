import React from 'react'
import ReactDOM from 'react-dom/client'
import { UniversalProvider } from '@unisim/sdk'
import { Capacitor } from '@capacitor/core'
import type { ProductCode } from '@unisim/sdk'
import App from './App'
import { useConverterStore } from './stores/converterStore'
import './index.css'

console.log(`build: ${import.meta.env.VITE_BUILD_SHA}`)

if (import.meta.env.DEV) {
  ;(window as unknown as { __stores: unknown }).__stores = {
    converter: useConverterStore
  }
}

// Universal Converter converts entirely client-side — it never writes a file
// anywhere. We mount <UniversalProvider> for the shared navbar, and in
// production point it at the REAL suite project + set cookieDomain for the
// suite-wide language choice, consistent with the other apps.
//
// The fallback is the REAL public suite project (publishable anon key — safe to
// ship; RLS is the security boundary). Env vars override.
// No accounts, and no user count from the phone app (privacy audit
// 2026-10-12). `noAccounts: true` drops the navbar's profile icon and sign-in,
// and <UsageTracker /> is gone. The SDK user count was retired in 0.187.0;
// its anonymous daily open count is already off under `noAccounts`, and
// `openCount` keeps it off in the iOS and Android builds whatever happens to
// `noAccounts` — they send nothing, which is what ios/App/App/PrivacyInfo.xcprivacy
// and store-assets/data-safety.json declare. Change all of them together, and
// PRIVACY.md + the "files stay on your device" article with them.
const universalConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || 'https://rygfxgalojojppxmhddo.supabase.co',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5Z2Z4Z2Fsb2pvanBweG1oZGRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NTY4MjUsImV4cCI6MjA5NDMzMjgyNX0.hLy_vt9vY_rdPKF3nL32yAuMCD604E3CH5VM7D7CaNE',
  // 'converter' isn't in the SDK's ProductCode union yet; the value only scopes
  // changelog/usage, neither of which this tool writes to.
  product: 'converter' as unknown as ProductCode,
  noAccounts: true,
  openCount: !Capacitor.isNativePlatform(),
  cookieDomain: import.meta.env.PROD ? '.unisim.co.uk' : undefined,
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UniversalProvider config={universalConfig}>
      <App />
    </UniversalProvider>
  </React.StrictMode>
)
