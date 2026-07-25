# Universal Converter

Convert audio in your browser. **Nothing is uploaded** — files are decoded and
re-encoded in the tab, on your own machine. No account, no paywall, no queue on
somebody else's server.

Part of the [UNI·SIM Universal Apps](https://opensource.unisim.co.uk) suite.
Live at **opensource.unisim.co.uk/converter** once deployed.

---

## Status

**Phase 1, step 1 — the app and the WAV path.** Drop files, set the output, and
convert to WAV using the browser's own audio decoder: no engine download, works
offline from the first visit, and reads anything the browser can play (MP3, M4A,
FLAC, OGG, Opus, AIFF, WebM…).

The compressed targets — MP3, M4A, FLAC, OGG, Opus, AIFF — are drawn in the UI
but **disabled**, because they need the `ffmpeg.wasm` core, which isn't wired up
yet. That's the next step, and it's a contained one:

- [`src/lib/formats.ts`](src/lib/formats.ts) — flip each row's `engine` from
  `'ffmpeg'` to whatever the core supports; the panel enables the chips off that
  field alone.
- [`src/lib/convert.ts`](src/lib/convert.ts) — `convertFile()` is the single seam.
  It throws `EngineUnavailableError` for ffmpeg targets today; replace that branch
  with the worker call.
- [`vite.config.ts`](vite.config.ts) — the Workbox rules are already in place:
  `globIgnores: ['**/*.wasm']` keeps the ~31 MB core out of the install-time
  precache, and a `CacheFirst` runtime rule caches it after the first conversion.
  **Don't remove those two rules.**

Bitrate, trim and tag-copying land with that engine — they're absent from the
panel rather than shipped as controls that do nothing.

**Phase 2 — video.** Trim, compress, change container, extract audio. It shares
the same core, worker, cache strategy and licence decision as the audio tab, so
it ships here as a second tab rather than a separate app (see `next-products.md`
§10 in the suite docs).

## Licensing

The code here is **MIT**, like the other Universal Apps. That changes when the
engine lands: `ffmpeg.wasm` cores built with `--enable-gpl` (the ones that
include libx264, i.e. H.264 encode) make the app a GPL derivative. The suite's
recommendation is to take the GPL core and relicense this app to GPL at that
point, disclosed here and in `LICENSE`. The alternative — staying LGPL by
dropping libx264 and encoding video as VP9/WebM only — is cleaner legally and
worse for users. **Decide before the core is added, not after.**

## Develop

```bash
cd /Users/jamesmarkey/Github/UNISIM/Universal_Apps/Universal_Converter
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run typecheck` | Types only |
| `npm test` | Byte-level self-tests for the WAV and ZIP writers |

`npm test` needs no browser: it checks the WAV header fields, sample
interleaving and clipping, the CRC-32 check value, and round-trips a real ZIP
through `unzip -t` and python's `zipfile`.

## How it's built

| | |
|---|---|
| Shell | Vite + React + TypeScript, PWA, Tailwind v4 |
| Chrome | `@unisim/sdk` — `UniversalAppsNavBar`, shared footer, suite switcher |
| State | zustand (`src/stores/converterStore.ts`) |
| Audio | `OfflineAudioContext` — decode, resample, re-channel, normalise, then a hand-written 16-bit PCM WAV writer |
| Batching | `src/lib/zip.ts` — a dependency-free STORED-entry ZIP writer for "Download all" |

The design — glyph, icon set, palette, screen layout and the states — is
documented in the suite docs alongside `BRANDING.md`.

### The mark

A conversion ring with an audio waveform inside it: the ring says "format in,
format out", the bars name the phase that shipped first. One drawing, three
sizes — the 22 px suite-switcher glyph, the 24 px navbar tile
(`src/components/Header/ProductLogo.tsx`) and the maskable app icon
(`public/favicon.svg`). The navbar copy carries slightly heavier strokes so it
survives at 16 px. Keep the three in sync.

The switcher entry ships in **`@unisim/sdk` 0.73.0** — `id: 'converter'`, Every
Day family, currently badged **Coming soon** because `/converter` doesn't resolve
yet. Drop that flag in `SuiteSwitcher.tsx` when the Pages project and portal
route are live.

## Deploying

Cloudflare Pages project served under `/converter` on
`opensource.unisim.co.uk`. `public/_redirects` maps the prefixed paths back onto
the flat `dist/` output; the portal Worker needs `/converter` in its `TARGETS`
plus an orbit tile in the Every Day family.

---

100% free — every feature, no paywalls. Open source, hosted by
[UNI SIM](https://www.unisim.co.uk).
