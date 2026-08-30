#!/usr/bin/env node
// The web assets Capacitor copied into the native project are actually loadable.
//
//   npm run check:mobile-bundle
//
// ⚠️ This exists because getting it wrong is INVISIBLE until the app is on a
// phone. The copied bundle is gitignored so `git status` is clean, Xcode says
// BUILD SUCCEEDED, the icon and version are right, and the install succeeds.
// The only symptom is a blank screen when you tap the icon.
//
// The fault: Universal Converter is hosted at opensource.unisim.co.uk/converter/, so the
// production build sets Vite's `base` to `/converter/` and index.html asks for
// `/converter/assets/index-….js`. Capacitor serves the bundle from `capacitor://localhost`,
// whose document root IS this copied directory — there is no `/converter/` inside it, so
// every one of those URLs 404s, no module script runs and the app never mounts.
// `--mode desktop` is the build that gets this right (base `./`, no PWA); it is
// what `npm run cap:sync` runs. A bare `npx cap sync` copies whatever `dist/`
// happens to hold, which is usually the last web build.
//
// It has happened for real: Universal PDF 0.6.14 shipped to an iPhone that way
// on 2026-08-28 and could not load.
//
// ⚠️ The check is "does every asset URL resolve INSIDE the bundle", NOT
// "are the URLs relative". Those are not the same rule and the difference
// matters elsewhere in the suite: an app that builds with base `/` legitimately
// ships root-absolute `/assets/…`, which is correct precisely because
// Capacitor serves the public directory at the scheme root. What is always
// wrong is a URL pointing at a path the bundle does not contain.
//
// The second half is the service worker. `--mode desktop` omits VitePWA
// entirely, so `sw.js` / `registerSW.js` / `workbox-*.js` in the copied bundle
// prove a web build was copied even in the case where its URLs happen to
// resolve — and that worker caches the hosted origin's URLs inside the app.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOSTED_BASE = '/converter/'
const TARGETS = [['iOS', 'ios/App/App/public']]

// Anything with a scheme, a protocol-relative host, or a bare fragment is not
// a file we ship. Everything else must exist in the copied directory.
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i

let failed = false
for (const [platform, dir] of TARGETS) {
  const bundle = join(ROOT, dir)
  const html = join(bundle, 'index.html')
  if (!existsSync(html)) {
    console.log(`${platform}: no copied bundle at ${dir} — skipped.`)
    continue
  }
  const source = readFileSync(html, 'utf8')

  const urls = [...source.matchAll(/(?:src|href)="([^"]*)"/g)]
    .map((m) => m[1].trim())
    .filter((u) => u && !EXTERNAL.test(u))

  const missing = []
  for (const url of urls) {
    // Strip the query/fragment, then resolve. index.html sits at the bundle
    // root, so a root-absolute path and a relative one resolve the same way.
    const path = decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\.?\//, '')
    if (!path) continue
    if (!existsSync(join(bundle, path))) missing.push(url)
  }

  const pwa = readdirSync(bundle).filter(
    (f) => f === 'sw.js' || f === 'registerSW.js' || /^workbox-.*\.js$/.test(f)
  )

  // A bundle with nothing to run passes every other check vacuously.
  const modules = [...source.matchAll(/<script\b[^>]*>/g)].filter(
    (m) => /type="module"/.test(m[0]) && /\bsrc="/.test(m[0])
  )

  if (missing.length === 0 && pwa.length === 0 && modules.length > 0) {
    console.log(
      `${platform}: ${urls.length} asset URLs all resolve inside ${dir}, ` +
        `${modules.length} module script(s), no service worker. OK`
    )
    continue
  }

  failed = true
  console.error(`${platform}: ${dir} is not a usable mobile bundle.`)
  for (const url of missing) {
    const why = url.startsWith(HOSTED_BASE)
      ? ` — the hosted base path "${HOSTED_BASE}", i.e. this is the production WEB build`
      : ''
    console.error(`  asset URL does not exist in the bundle: ${url}${why}`)
  }
  for (const f of pwa) {
    console.error(`  service worker file present: ${f} — a --mode desktop build has none`)
  }
  if (modules.length === 0) {
    console.error('  index.html loads no module script at all')
  }
}

if (failed) {
  console.error('\nRebuild and re-copy:  npm run cap:sync')
  process.exit(1)
}
