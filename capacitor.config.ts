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
  // Android 15+ lays the window out under the status bar and the camera
  // cutout (edge-to-edge is enforced from targetSdk 35, with no opt-out at 36).
  // Capacitor 8 removed `android.adjustMarginsForEdgeToEdge` in favour of its
  // core SystemBars plugin, which reads index.html's `viewport-fit=cover`: on a
  // WebView from Chromium 140 the page is drawn edge-to-edge and
  // `env(safe-area-inset-*)` carries the real insets, which this app pads by,
  // exactly as on iOS. On an older WebView, where those env values read 0, it
  // pads the web view natively instead and the strips show the WINDOW
  // background: light from values/styles.xml, repainted to match the app's own
  // theme by WindowThemePlugin (android/…) via src/lib/systemBars.ts.
  plugins: {
    SystemBars: {
      // The glyphs' colour at launch: dark, for the white strip / light navbar.
      // Left at DEFAULT it would follow the phone's dark mode rather than the
      // app's own setting. src/lib/systemBars.ts switches it to follow the
      // app's resolved theme once the page is up.
      style: 'LIGHT',
      // index.html says cover; saying so here spares a layout jump on start.
      initialViewportFitValueHint: 'cover',
    },
  },
}

export default config
