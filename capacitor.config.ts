import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor wraps the same Vite build that ships to the web. `webDir` is the
// Vite build output. Capacitor serves it from a local `capacitor://` /
// `https://localhost` origin, so assets must resolve relatively — build with
// `npm run build:desktop` (which sets Vite `base` to `./` and drops the service
// worker) before running `npx cap sync`, NOT the production `/converter/` base
// build, which would load as a white screen.
const config: CapacitorConfig = {
  appId: 'uk.co.unisim.converter',
  appName: 'Universal Converter',
  webDir: 'dist',
}

export default config
