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
  // cutout (edge-to-edge is enforced from targetSdk 35, with no opt-out at 36),
  // and no viewport meta tag moves an Android window. This margins the web
  // view by the system bars and the cutout. "auto", not "force": Android 14 and
  // below aren't edge-to-edge and would take a second inset. The margin shows
  // the WINDOW background, which is why values/styles.xml pins it light.
  android: { adjustMarginsForEdgeToEdge: 'auto' },
}

export default config
