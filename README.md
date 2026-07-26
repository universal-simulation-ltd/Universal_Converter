# Universal Converter

Convert audio and images in your browser. **Nothing is uploaded** — files are
decoded and re-encoded in the tab, on your own machine. No account, no paywall,
no queue on somebody else's server.

Part of the [UNI·SIM Universal Apps](https://opensource.unisim.co.uk) suite.
**Live at [opensource.unisim.co.uk/converter](https://opensource.unisim.co.uk/converter).**

---

## What works

| Tab | Targets | Engine |
|---|---|---|
| **Audio** | **MP3** (128–320 kbps CBR) | LAME compiled to JS ([`@breezystack/lamejs`](https://www.npmjs.com/package/@breezystack/lamejs)), dynamically imported on first use |
| | **Opus**, **M4A** (AAC) | The browser's own WebCodecs `AudioEncoder`, in containers we write ([`ogg.ts`](src/lib/ogg.ts), [`mp4.ts`](src/lib/mp4.ts)) — no library at all |
| | **FLAC** | libFLAC compiled to wasm ([`libflacjs`](https://www.npmjs.com/package/libflacjs), MIT), fetched on first use |
| | **WAV**, **AIFF** | Our own 16-bit PCM writers ([`wav.ts`](src/lib/wav.ts), [`aiff.ts`](src/lib/aiff.ts)) |
| | OGG (Vorbis) | **Disabled** — needs the ffmpeg core (below) |
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

OGG (Vorbis) is the last target that needs `ffmpeg.wasm` — and Vorbis is
superseded by Opus, which already works, so the practical gap is video. **The only published `@ffmpeg/core` is `GPL-2.0-or-later`** — it
bundles libx264 — so adding it relicenses this app. That's a decision, not a
chore. Working around it, one format at a time, is why only one chip is still
disabled:

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
- **FLAC didn't either.** `libflacjs` is MIT around libFLAC (BSD) — both
  permissive, so the app stays MIT. ~230 KB, fetched on first FLAC conversion.
- **Vorbis still would**, but Opus supersedes it and already works.
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

Trim and tag-copying both shipped without it: trim is arguments to the offline
render, and tags are read from ID3v2 / MP4 `ilst` / Vorbis comments and written
into MP3 (ID3v2.3) and Opus (`OpusTags`). FLAC and M4A output can't carry them
yet — each needs its own metadata writer, and the toggle's hint says so per
format rather than promising something that doesn't happen.

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
| `npm test` | Byte-level self-tests for every writer: WAV, AIFF, MP3, Ogg, MP4, ZIP |

`npm test` needs no browser and shells out to real third-party readers, because
"our reader agrees with our writer" proves nothing: WAV header fields, sample
interleaving and clipping; AIFF through macOS **`afinfo`** (which is what
actually validates the 80-bit extended sample rate); a LAME-encoded MP3 through
`afinfo` too; the Ogg page/lacing/CRC structure; the MP4 box tree (box order,
the `stco` offset landing on the first frame's bytes, the sample tables, the
priming edit list); ID3v2.3 tags (synchsafe sizes, UTF-16 text, round trip); the
trim clock parser; the resize maths; the canonical CRC-32 check value; and a real ZIP through
**`unzip -t`** and python's `zipfile`.

**Opus, M4A and FLAC are checked in-browser** rather than by an external reader.
Opus and M4A round-trip through `decodeAudioData` *and* an `<audio>` element
(independent Chromium paths) — M4A's confirms zero leading silence, which is the
edit list doing its job. FLAC gets the strongest check available: converting
white noise and comparing **every sample** against the input — 88,200 of 88,200
bit-exact, which is the only way to substantiate calling it lossless.

That test is what caught a real bug in the shared float→int16 conversion. See the
comment in [`pcm.ts`](src/lib/pcm.ts): the scaling is asymmetric because it has to
invert what the decoder does (measured, not assumed — positives come back as
`v/32767`, negatives as `v/32768`), and it has to *round*, because `setInt16`
truncates. Before the fix, 20,492 of 88,200 samples came back one LSB low, so
"lossless" wasn't.

## How it's built

| | |
|---|---|
| Shell | Vite + React + TypeScript, PWA, Tailwind v4 |
| Chrome | `@unisim/sdk` — `UniversalAppsNavBar`, shared footer, suite switcher |
| State | zustand (`src/stores/converterStore.ts`) |
| Audio | `OfflineAudioContext` — decode, trim, resample, re-channel, normalise — then WAV / AIFF writers, LAME for MP3, libFLAC for FLAC, or WebCodecs + our own Ogg / MP4 muxers for Opus and M4A |
| Images | `createImageBitmap` + canvas — decode, downscale, re-encode |
| Tags | `src/lib/tags.ts` — reads ID3v2 / MP4 `ilst` / Vorbis comments, writes ID3v2.3 and Vorbis comments |
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

The switcher entry ships in **`@unisim/sdk`** (added 0.73.0, un-badged in
0.75.0) — `id: 'converter'`, Every Day family.

## Deploying

Git-connected Cloudflare Pages project — **every merge to `main` rebuilds
production**, and PRs get preview URLs. The origin is
`universal-converter-3z4.pages.dev`; the suffix is not a typo, Cloudflare issued
it despite the project name never having been used before, so don't "correct" it
in the portal Worker's `TARGETS`.

`public/_redirects` maps the `/converter/*` paths back onto the flat `dist/`
output — load-bearing, since Vite's `base` only rewrites URLs inside the HTML.

---

100% free — every feature, no paywalls. Open source, hosted by
[UNI SIM](https://www.unisim.co.uk).
