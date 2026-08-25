# Universal Converter

Convert audio, images, video and documents in your browser. **Nothing is
uploaded** — files are read and rewritten in the tab, on your own machine. No
account, no paywall, no queue on somebody else's server.

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

The circle and the two-column shape are **Universal Compress's**, on purpose:
both apps open on "drop anything and we will work out what it is", and two front
doors to one idea that look different make the suite feel like unrelated tools.
The ring is the *same component* — `DropRing` from `@unisim/sdk` — not a copy,
so a change to it lands in both. The right-hand column answers *"will it take my
file?"* before a drop, listing every extension each tab accepts and naming MKV
and AVI as the two it refuses, and *"where did everything go?"* after one.

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
- **Documents → one PDF.** Every queued document, one after another, each
  starting on a new page with its filename as a heading. What it throws away is
  the *separateness*: **the result is one file**, and there is no way to get the
  documents back apart here.

The PDF machinery is [`src/lib/pdfcore.ts`](src/lib/pdfcore.ts), still with no
dependency and in the same spirit as this app's own ZIP and Ogg writers.

> It used to say here that if text was ever wanted, the right move was to take a
> real PDF library rather than grow this. The **Files tab** was that moment, and
> the note was re-read before it was overruled — [the reasoning is written
> down](#the-pdf-writer-and-why-it-isnt-a-library). Reading or editing an
> existing PDF is still out: that needs a parser, and Universal PDF is the app
> for it.

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
| | **GIF** (animated) | Ours entirely ([`gif.ts`](src/lib/gif.ts)) — median-cut palette, LZW, frame differencing. The **only** target here the browser cannot encode: there is no `toBlob('image/gif')` in any engine, and no animation encoder at all |
| **Files** | **PDF** with selectable text, real pagination and working links | Our own readers and our own text-flow PDF writer — no dependency. See [The Files tab](#the-files-tab) |
| | **Text**, **HTML**, **Markdown** | The same document model, rendered a different way |
| | **CSV**, **JSON** | Only from a file that already has rows — see the note below |

Input is anything the browser can decode: MP3, M4A/AAC, FLAC, OGG, Opus, WAV,
AIFF, WebM for audio; PNG, JPEG, WebP, GIF, BMP, AVIF, SVG for images; MP4, M4V
and MOV for video; DOCX, DOC, ODT, RTF, TXT, MD, HTML, CSV and JSON for
documents. All four tabs share one queue, one settings vocabulary and one privacy
story; AVIF and H.264 are probed at runtime because support for them varies by
browser — and the video tab probes the H.264 **encoder** and **decoder**
separately, because a GIF needs only the decoder. A browser that can read an MP4
but not write one can still make a GIF, and the chips say so.

**Dropping a video on the audio tab extracts its soundtrack.** `decodeAudioData`
reads an MP4's audio track directly, so the whole audio pipeline — trim,
resample, normalise, any of the seven targets — works on a video file unchanged.
That's why there's no separate "extract audio" mode.

Decoding, resampling, re-channelling and normalising all happen in a single
`OfflineAudioContext` render, so a 96 kHz FLAC drops to 44.1 kHz on the way into
LAME rather than failing at the encoder.

## The Files tab

Documents in, a laid-out PDF out — and, where it makes sense, text, HTML,
Markdown, CSV or JSON instead. Everything happens in the tab; a contract, a
payslip or a diagnosis never leaves the machine, which is the whole reason to
do this in a browser rather than on somebody's upload form.

| In | Out | How |
|---|---|---|
| **DOCX** | PDF · TXT · HTML · MD | A ZIP of XML. `document.xml` for the body, plus `styles.xml`, `numbering.xml` and the rels part — headings, nested lists, tables, bold/italic/underline, hyperlinks, embedded images and hard page breaks all survive |
| **DOC** (Word 97–2003) | PDF · TXT · HTML · MD | **Text only.** A compound file with a piece table; see below |
| **ODT** | PDF · TXT · HTML · MD | Same shape as DOCX over the OpenDocument vocabulary. `fo:break-before` on a paragraph style is a real page break |
| **RTF** | PDF · TXT · HTML · MD | A brace-scoped tokeniser — bold, italic, underline, headings, lists |
| **TXT** | PDF · HTML · MD | Guesses whether the file is hard-wrapped, and re-flows it if so |
| **MD** | PDF · TXT · HTML | The parser is a port of Universal PDF's; see below |
| **HTML** | PDF · TXT · MD | The browser's own `DOMParser`, which does not run scripts or fetch anything |
| **CSV / TSV** | PDF · **JSON** · TXT · HTML · MD | RFC 4180, with the delimiter sniffed — a European Excel writes semicolons |
| **JSON** | PDF · **CSV** · TXT · HTML · MD | An array of flat objects becomes a grid; anything else is pretty-printed |

**CSV and JSON are only offered where they can be honoured.** They need rows and
columns to start from, so they are reachable from a CSV or a JSON file and not
from a Word document — the chips grey out with the reason rather than producing a
one-column sheet of somebody's paragraphs. Where several files are queued, the
targets on offer are the ones **every** file in the queue can reach.

### Everything goes through one model

Nine inputs and six outputs would be fifty-odd conversions wired directly. They
go through **`RichDoc`** ([`src/lib/doc/model.ts`](src/lib/doc/model.ts))
instead — headings, paragraphs, lists, tables, code, rules, images — so it is
nine readers and six writers, and a tenth input costs one file rather than six.
The model is deliberately the *intersection* of what these formats can express,
not the union: anything outside it is flattened by the reader that knows what it
meant, and the loss is **reported on the row**, not discovered on page four.

### The PDF writer, and why it isn't a library

`pdf.ts` used to end with a note saying that if text was ever wanted, the right
move was to take a real PDF library rather than grow the writer. This tab was
that moment, and the note was re-read before it was overruled:

- The expensive half of "documents to PDF" is the **layout**, not the file
  format — and Universal PDF already has that engine. Only its bottom inch
  touches pdf-lib (`widthOfTextAtSize`, `drawText`, `drawRectangle`), so porting
  it needed four primitives, not a library.
- The **base-14 fonts are in every PDF reader**, so there is no embedding, no
  subsetting and no CMap — the genuinely hard parts — in exchange for one table
  of glyph widths per font ([`doc/metrics.ts`](src/lib/doc/metrics.ts)).
- pdf-lib is ~380 KB gzipped, and this app's pitch is that it is small and works
  **offline from the first visit**. A lazily-fetched library breaks the second
  half of that. LAME and libFLAC are fetched on demand because there is no other
  way to have MP3 and FLAC at all; there is another way to have text.

So [`pdfcore.ts`](src/lib/pdfcore.ts) writes the objects and
[`doc/write/pdf.ts`](src/lib/doc/write/pdf.ts) lays out the page — a port of
Universal PDF's `markdownToPdf.ts`, kept structurally recognisable on purpose so
a fix in either app is findable in the other. The images-to-PDF export was moved
onto the same writer, because two PDF writers in one app is how you get two PDFs
that disagree about their own metadata.

**Smart quotes and dashes survive**, which Universal PDF's markdown export
flattens to ASCII — WinAnsi has those glyphs and pdf-lib's standard fonts refuse
them, so a converted Word document keeps its typography here.

### What it can't do, said out loud

- **Latin alphabets only.** No font embedding means no Greek, Cyrillic, Hebrew,
  Arabic or CJK. Characters that can't be written are **counted and named** on
  the row — you are shown the actual glyphs — rather than silently becoming `?`.
- **A `.doc` gives up its text and nothing else.** The old format keeps its
  formatting in CHPX/PAPX property runs through a page tree of 512-byte bins,
  which is a second machine the size of the first, for bold. So the piece table
  is walked, the words come out in the right order and the right encoding, and
  bold, headings, lists, tables, page breaks and pictures do not. Two things are
  disclosed on the row rather than left to be found: that, and the fact that
  **tracked deletions may still appear** — a `.doc` stores deleted text as
  ordinary text, and only Word can tell them apart.
- **Not XLSX or PPTX.** A spreadsheet saved as CSV converts; a slide deck needs
  exporting to PDF from the app that made it. Both are refused on drop, by name,
  with the way forward — not accepted and failed later.
- **PDF is an output, not an input.** Reading one needs a parser, which is a
  different program: [Universal PDF](https://opensource.unisim.co.uk/pdf) is
  the app for that.
- Headers, footers, footnotes, comments, charts and anything positioned rather
  than flowed are left behind. Where the file had one, the row says so.

### Tested against real files

[`e2e/files.e2e.mjs`](e2e/files.e2e.mjs) runs **114 checks** in a real browser —
the pipeline over every input/output pair, then the tab itself clicked with a
real file input and a real download. The fixtures are generated by
[`e2e/fixtures/make-fixtures.mjs`](e2e/fixtures/make-fixtures.mjs): the DOCX is
written by hand so the test controls exactly which features are exercised, and
the **DOC, ODT and RTF are produced by LibreOffice** converting it — a
hand-written `.doc` would be a compound file shaped the way I imagined one, which
proves nothing about the reader.

The PDF assertions read the raw bytes, which works because content streams are
not compressed; `assertUncompressed` fails loudly the day that changes rather
than letting the suite go quietly blind. Every fixture's output is also opened
with **pdf.js** and its text extracted, because byte assertions can all pass on a
file no reader accepts.

```bash
npm run test:files    # 114 checks in a headless Chromium
npm run fixtures      # only to regenerate them; needs LibreOffice for DOC/ODT/RTF
```

The fixtures are committed, so the suite runs without LibreOffice installed.
Playwright comes from `Universal_Beam/node_modules` rather than being a
dependency here — the same borrowing the other apps' e2e specs do.

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

- **GIF didn't either, and this one was never going to.** No browser encodes GIF
  — `canvas.toBlob('image/gif')` does not exist in any engine, and no engine
  exposes an animation encoder of any kind — so unlike every other target here,
  there was no platform encoder to reach for. It is the one format the app
  writes from nothing: a median-cut palette over a 5-5-5 histogram of the whole
  clip, nearest-colour lookup cached per bin, GIF's variable-width LZW, and
  frame differencing with a transparent index so an unchanged background costs
  nothing. All of it is [`gif.ts`](src/lib/gif.ts), about 600 lines, no
  dependency. On a gradient-heavy test clip it lands within 0.3 dB PSNR of
  ffmpeg's own `palettegen`/`paletteuse` at the same file size.

**What the core would still buy**, honestly:

- **MKV, AVI and WMV input.** Different containers entirely — the reader here is
  ISO base media only, so those are refused on drop with a sentence rather than
  accepted and failed half way through. Fragmented MP4 is refused the same way.
- **OGG (Vorbis) output**, superseded by Opus.
- **Video in browsers with no WebCodecs H.264 encoder** — Firefox today. The tab
  probes for one and says so plainly instead of failing at conversion time. Note
  this costs the **MP4** target only: GIF needs the decoder, not the encoder, so
  it stays available where the decoder is.

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
| `npm test` | Byte-level self-tests for every writer: WAV, AIFF, MP3, Ogg, MP4, GIF, ID3, ZIP |
| `npm run test:video` | The video tab's GIF export, driven end to end in a real browser |

`npm test` needs no browser and shells out to real third-party readers, because
"our reader agrees with our writer" proves nothing: WAV header fields, sample
interleaving and clipping; AIFF through macOS **`afinfo`** (which is what
actually validates the 80-bit extended sample rate); a LAME-encoded MP3 through
`afinfo` too; the Ogg page/lacing/CRC structure; the MP4 box tree (box order,
the `stco` offset landing on the first frame's bytes, the sample tables, the
priming edit list); ID3v2.3 tags (synchsafe sizes, UTF-16 text, round trip); the
trim clock parser; the resize maths; the canonical CRC-32 check value; a real ZIP through
**`unzip -t`** and python's `zipfile`; and an animated GIF decoded by **ffmpeg**,
where every pixel of every frame is compared to the palette colour our own index
array claims — exactly right, not roughly, because that is the assertion that
catches an LZW code width that grows one entry late or a difference rectangle
off by a row.

`npm run test:video` needs Playwright (borrowed from a sibling app) and ffmpeg,
which builds the H.264 fixture and reads the resulting GIF back. Everything
between a dropped MP4 and the encoder — WebCodecs, the canvas, the two decode
passes, the `<a download>` — only exists in a browser, so that is where it is
tested.

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
| GIF | `src/lib/videogif.ts` — `mp4read` → `VideoDecoder` → canvas → **twice**: pass one builds one palette for the whole animation, pass two quantises and writes with `src/lib/gif.ts`. Two passes rather than holding the frames, which at 480×270 would be 78 MB of live pixels for ten seconds |
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
