# Universal Converter

Convert audio, images and video in your browser. **Nothing is uploaded** — files
are decoded and re-encoded in the tab, on your own machine. No account, no
paywall, no queue on somebody else's server.

Part of the [UNI·SIM Universal Apps](https://opensource.unisim.co.uk) suite.
**Live at [opensource.unisim.co.uk/converter](https://opensource.unisim.co.uk/converter).**

---


## The All tab

The three studios each answer *"convert this kind of thing"* — which is the
right question only once you have worked out which kind of thing you have. The
**All** tab asks nothing: drop pictures, audio and video together and it sorts
each one onto the tab that can do the work, then tells you what went where.

It deliberately does **not** jump you to another tab. A mixed drop has no single
destination, and moving somebody while files are still landing is how you lose
track of what you just dropped. Anything it cannot read is named individually
rather than counted — "3 files skipped" makes you go and work out which three.

## Other exports

Some conversions cross from one kind of media to another, and they live in their
own card in the right column rather than in the panel above. That separation is
the point: everything in the panel keeps what you dropped and changes its
format, while everything here **throws something away**.

- **Pictures → one PDF.** Every queued image becomes a page. Pages are JPEG, so
  it is lossy and **transparency is flattened onto white**; long edges are capped
  at 2000px so the file stays sendable; and it is a picture in a PDF, not a
  document, so there is no selectable text.
- **Video → sound only.** Takes the soundtrack out and gives you MP3, M4A or
  WAV. **There is no video in the result** — that is said in the card, in a
  box, before you press anything.

The PDF writer is [`src/lib/pdf.ts`](src/lib/pdf.ts) and is about 150 lines with
no dependency, in the same spirit as this app's own ZIP and Ogg writers. It does
images and nothing else — no text, no fonts, no editing an existing PDF. If any
of that is ever wanted, take a real PDF library then rather than growing it.

## What works

| Tab | Targets | Engine |
|---|---|---|
| **Audio** | **MP3** (128–320 kbps CBR) | LAME compiled to JS ([`@breezystack/lamejs`](https://www.npmjs.com/package/@breezystack/lamejs)), dynamically imported on first use |
| | **Opus**, **M4A** (AAC) | The browser's own WebCodecs `AudioEncoder`, in containers we write ([`ogg.ts`](src/lib/ogg.ts), and MP4 via [`@unisim/media`](https://www.npmjs.com/package/@unisim/media)) — no library at all |
| | **FLAC** | libFLAC compiled to wasm ([`libflacjs`](https://www.npmjs.com/package/libflacjs), MIT), fetched on first use |
| | **WAV**, **AIFF** | Our own 16-bit PCM writers ([`wav.ts`](src/lib/wav.ts), [`aiff.ts`](src/lib/aiff.ts)) |
| | OGG (Vorbis) | **Disabled** — needs the ffmpeg core (below) |
| **Images** | **WebP**, **JPEG**, **PNG**, **AVIF** | The browser's own canvas encoder — convert, re-quality and resize |
| **Video** | **MP4** (H.264 + AAC) | The browser's own WebCodecs `VideoEncoder`, between a demuxer and a muxer we write — trim, scale and compress. Lives in [`@unisim/media`](https://www.npmjs.com/package/@unisim/media) now, shared with [Universal Video](https://opensource.unisim.co.uk/video) |

Input is anything the browser can decode: MP3, M4A/AAC, FLAC, OGG, Opus, WAV,
AIFF, WebM for audio; PNG, JPEG, WebP, GIF, BMP, AVIF, SVG for images; MP4, M4V
and MOV for video. All three tabs share one queue, one settings vocabulary and
one privacy story; AVIF and H.264 are probed at runtime because support for them
varies by browser.

**Dropping a video on the audio tab extracts its soundtrack.** `decodeAudioData`
reads an MP4's audio track directly, so the whole audio pipeline — trim,
resample, normalise, any of the seven targets — works on a video file unchanged.
That's why there's no separate "extract audio" mode.

Decoding, resampling, re-channelling and normalising all happen in a single
`OfflineAudioContext` render, so a 96 kHz FLAC drops to 44.1 kHz on the way into
LAME rather than failing at the encoder.

## The ffmpeg question (and why nothing waited for it)

**The only published `@ffmpeg/core` is `GPL-2.0-or-later`** (it bundles libx264),
so adding it relicenses this app. That's a decision, not a chore — and it is
still un-taken. Working around it, one format at a time, is why only one chip is
disabled and why video shipped anyway:

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
- **Video didn't either — and this was the surprise.** libx264 is only needed if
  you bring your own H.264 encoder; Chrome, Edge and Safari 16.4+ already have
  one behind WebCodecs. What was actually missing was the container work either
  side of it, because WebCodecs decodes *frames*, not files: nothing in the
  browser will hand you an `EncodedVideoChunk` from an MP4, and nothing will turn
  chunks back into one. So `mp4read` walks the box tree and resolves
  `stts`/`stsc`/`stsz`/`stco`/`stss`/`ctts` into a flat sample list, and
  `mp4mux` writes the picture and sound tracks back out. No third-party codec
  anywhere in the path, and the app stays MIT.

  Those files now live in **`@unisim/media`** rather than in this repo — see
  "Where the pipeline lives" below.

**What the core would still buy**, honestly:

- **MKV, AVI and WMV input.** Different containers entirely — the reader here is
  ISO base media only, so those are refused on drop with a sentence rather than
  accepted and failed half way through. Fragmented MP4 is refused the same way.
- **OGG (Vorbis) output**, superseded by Opus.
- **Video in browsers with no WebCodecs H.264 encoder** — Firefox today. The tab
  probes for one and says so plainly instead of failing at conversion time.

**A WebCodecs trap worth knowing:** `AudioEncoder.isConfigSupported()` is not
reliable for AAC. On Chrome 148/macOS it answers `supported: true` for every
bitrate, and then the encoder fails at runtime for some — **exactly 32 kbps per
channel** errors out (64 kbps stereo and 32 kbps mono both die; 48 and 80 stereo
are fine). So `aacSupported()` establishes support by **encoding one real frame**,
and the bitrate control strikes through anything that fails. Related: never call
`flush()` on an encoder that has already fired its `error` callback — it throws
"Cannot call 'flush' on a closed codec" and buries the real cause.

If the core ever does land it's a contained change:

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

**Video trims cut at a keyframe.** A delta frame means nothing without the frames
it was coded against, so the decoder is fed from the last keyframe at or before
the cut and the frames ahead of it are dropped after decoding rather than never
decoded — which is why the trim hint says "begins at the nearest keyframe"
instead of promising a frame-exact cut it can't make without re-encoding the
whole GOP.

## Licensing

**MIT**, like the other Universal Apps, and accurate today — including for
video: nothing here derives from FFmpeg. The H.264 encoder is the browser's own,
reached through WebCodecs; only the container parsing and writing are ours. LAME
is a separate LGPL-3.0 package, which MIT code may depend on. Taking the GPL
ffmpeg core would change all of that — relicense the app to GPL at that point and
say so here and in `LICENSE`. **Decide before adding it, not after.**

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
| `npm test` | Byte-level self-tests for every writer: WAV, AIFF, MP3, Ogg, MP4, ID3, ZIP |

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

## Where the pipeline lives

The MP4 reader, the MP4/M4A writers, the movie muxer, the AAC encoder and the
frame-sizing maths are **not in this repo any more.** They moved to
**[`@unisim/media`](https://www.npmjs.com/package/@unisim/media)** on 2026-08-06,
when [Universal Video](https://opensource.unisim.co.uk/video) became its own app
and the pipeline acquired a second consumer.

- The files were **moved, not rewritten** — the source, and its self-tests, are
  the ones that shipped here in `2e0fabd`. This app's behaviour is unchanged.
- Their self-tests moved too. Run `npm test` in
  `backoffice/universal-platform/packages/media` for the container coverage;
  what is left in `scripts/selftest.mjs` here covers the audio writers, the ZIP
  writer and the tags — plus one block checking this app really does call the
  package rather than a stale copy.
- `src/lib/types.ts`, `src/lib/humanise.ts` and `src/lib/convert.ts` **re-export**
  the shared pieces, so every call site inside this app is unchanged.

`@unisim/media` is MIT, has no runtime dependencies, and pulls in no wasm — the
whole point of it is that the browser already has the codecs.

## How it's built

| | |
|---|---|
| Shell | Vite + React + TypeScript, PWA, Tailwind v4 |
| Chrome | `@unisim/sdk` — `UniversalAppsNavBar`, shared footer, suite switcher |
| State | zustand (`src/stores/converterStore.ts`) |
| Audio | `OfflineAudioContext` — decode, trim, resample, re-channel, normalise — then WAV / AIFF writers, LAME for MP3, libFLAC for FLAC, or WebCodecs + our own Ogg / MP4 muxers for Opus and M4A |
| Images | `createImageBitmap` + canvas — decode, downscale, re-encode |
| Video | `@unisim/media`: `mp4read` → WebCodecs `VideoDecoder` → canvas scale → `VideoEncoder` → `mp4mux`; the audio track goes through the audio pipeline above and is muxed back alongside |
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
