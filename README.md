# Universal Converter

Convert audio and images in your browser. **Nothing is uploaded** — files are
decoded and re-encoded in the tab, on your own machine. No account, no paywall,
no queue on somebody else's server.

Part of the [UNI·SIM Universal Apps](https://opensource.unisim.co.uk) suite.
Live at **opensource.unisim.co.uk/converter** once deployed.

---

## What works

| Tab | Targets | Engine |
|---|---|---|
| **Audio** | **MP3** (128–320 kbps CBR) | LAME compiled to JS ([`@breezystack/lamejs`](https://www.npmjs.com/package/@breezystack/lamejs)), dynamically imported on first use |
| | **Opus**, **M4A** (AAC) | The browser's own WebCodecs `AudioEncoder`, in containers we write ([`ogg.ts`](src/lib/ogg.ts), [`mp4.ts`](src/lib/mp4.ts)) — no library at all |
| | **WAV**, **AIFF** | Our own 16-bit PCM writers ([`wav.ts`](src/lib/wav.ts), [`aiff.ts`](src/lib/aiff.ts)) |
| | FLAC, OGG (Vorbis) | **Disabled** — need the ffmpeg core (below) |
| **Images** | **WebP**, **JPEG**, **PNG**, **AVIF** | The browser's own canvas encoder — convert, re-quality and resize |
| **Video** | — | Phase 2 |

Input is anything the browser can decode: MP3, M4A/AAC, FLAC, OGG, Opus, WAV,
AIFF, WebM for audio; PNG, JPEG, WebP, GIF, BMP, AVIF, SVG for images. Both tabs
share one queue, one settings vocabulary and one privacy story; AVIF is probed at
runtime because canvas support for it varies by browser.

Decoding, resampling, re-channelling and normalising all happen in a single
`OfflineAudioContext` render, so a 96 kHz FLAC drops to 44.1 kHz on the way into
LAME rather than failing at the encoder.

## The ffmpeg question (and why MP3 didn't wait for it)

FLAC and OGG (Vorbis) need real codecs, which in practice means `ffmpeg.wasm`. **The only published `@ffmpeg/core` is `GPL-2.0-or-later`** — it
bundles libx264 — so adding it relicenses this app. That's a decision, not a
chore, and it's why those four chips are disabled rather than half-built:

- **MP3 didn't need it.** LAME's JS port is LGPL-3.0, which is a *dependency*
  licence, not a project one, so the app stays MIT — and it's ~170 KB against the
  core's ~31 MB.
- **Opus didn't either.** WebCodecs exposes the browser's own Opus encoder, so
  the only missing piece was the Ogg container — about a page of code, and no
  third-party codec anywhere in the path. Support is probed at runtime
  (`opusSupported()`), same as AVIF on the images side.
- **M4A didn't either.** Same encoder, different container: `mp4.ts` writes the
  MP4 box tree (including the `stco` offset, which can only be filled in once
  `moov`'s size is known, and an `elst` edit list so playback doesn't open on the
  encoder's priming samples).
- **The remaining two still do.** Taking the GPL core is the suite's standing
  recommendation (`next-products.md` §10); the alternative is a custom LGPL build
  with libx264 dropped, which is a real toolchain job.
- **Video forces the issue.** H.264/MP4 output is exactly what libx264 provides,
  so Phase 2 can't dodge it.

**A WebCodecs trap worth knowing:** `AudioEncoder.isConfigSupported()` is not
reliable for AAC. On Chrome 148/macOS it answers `supported: true` for every
bitrate, and then the encoder fails at runtime for some — **exactly 32 kbps per
channel** errors out (64 kbps stereo and 32 kbps mono both die; 48 and 80 stereo
are fine). So `aacSupported()` establishes support by **encoding one real frame**,
and the bitrate control strikes through anything that fails. Related: never call
`flush()` on an encoder that has already fired its `error` callback — it throws
"Cannot call 'flush' on a closed codec" and buries the real cause.

FLAC and Vorbis, WebCodecs will *not* encode. FLAC's best non-ffmpeg candidate is
[`libflacjs`](https://www.npmjs.com/package/libflacjs) (MIT).

When the core does land it's a contained change:

- [`src/lib/formats.ts`](src/lib/formats.ts) — flip each row's `engine` field; the
  panel enables chips off that alone.
- [`src/lib/convert.ts`](src/lib/convert.ts) — `convertAudio()` is the seam. It
  throws `EngineUnavailableError` for ffmpeg targets today.
- [`vite.config.ts`](vite.config.ts) — the Workbox rules are already in place:
  `globIgnores: ['**/*.wasm']` keeps the core out of the install-time precache and
  a `CacheFirst` runtime rule caches it after the first conversion. **Don't
  remove those two rules.**

Tag-copying lands with that engine too — absent from the panel rather than
shipped as a control that does nothing. (Trim shipped without it: start/end are
just arguments to the offline render.)

## Licensing

**MIT**, like the other Universal Apps, and accurate today: nothing here derives
from FFmpeg. LAME is a separate LGPL-3.0 package, which MIT code may depend on.
Taking the GPL ffmpeg core would change that — relicense the app to GPL at that
point and say so here and in `LICENSE`. **Decide before adding it, not after.**

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
| `npm test` | Byte-level self-tests for the WAV, AIFF, MP3 and ZIP writers |

`npm test` needs no browser and shells out to real third-party readers, because
"our reader agrees with our writer" proves nothing: WAV header fields, sample
interleaving and clipping; AIFF through macOS **`afinfo`** (which is what
actually validates the 80-bit extended sample rate); a LAME-encoded MP3 through
`afinfo` too; the Ogg page/lacing/CRC structure; the MP4 box tree (box order,
the `stco` offset landing on the first frame's bytes, the sample tables, the
priming edit list); the trim clock parser; the resize maths; the canonical CRC-32 check value; and a real ZIP through
**`unzip -t`** and python's `zipfile`.

**Opus and M4A are checked in-browser** rather than by an external reader: both
containers are validated by round-tripping through `decodeAudioData` *and* an
`<audio>` element (independent Chromium paths), plus the structural tests above.
CoreAudio has no Ogg parser, so `afinfo` can't help with Opus; M4A's round-trip
confirms zero leading silence, which is the edit list doing its job.

## How it's built

| | |
|---|---|
| Shell | Vite + React + TypeScript, PWA, Tailwind v4 |
| Chrome | `@unisim/sdk` — `UniversalAppsNavBar`, shared footer, suite switcher |
| State | zustand (`src/stores/converterStore.ts`) |
| Audio | `OfflineAudioContext` — decode, trim, resample, re-channel, normalise — then WAV / AIFF writers, LAME for MP3, or WebCodecs + our own Ogg / MP4 muxers for Opus and M4A |
| Images | `createImageBitmap` + canvas — decode, downscale, re-encode |
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
