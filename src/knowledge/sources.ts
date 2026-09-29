import type { Source } from './types'

// The research, standards and reports behind each article, keyed by article
// id. The same in every language, so kept once here and attached by index.ts.
//
// Original research papers first, then the standards, then guidance — and
// only sources for what the app really does (checked against src/ on
// 2026-09-29: audio out is MP3 from lamejs, M4A (AAC) and Opus from the
// browser's WebCodecs AudioEncoder — lib/ogg.ts writes the Ogg Opus container
// by hand — FLAC from libflacjs (libFLAC compiled to WebAssembly), and WAV and
// AIFF from our own writers; video is H.264/AAC in MP4 through WebCodecs with
// @unisim/media's MP4 demuxer and muxer; GIFs come from our own GIF89a writer,
// median-cut palette plus LZW, in lib/gif.ts; HEIC is decoded by heic-to
// (libheif); documents go through @unisim/doc, which reads DOCX/ODT by
// unzipping them, reads old .doc through its OLE compound-file container, lays
// Hebrew out with the UAX #9 bidi algorithm, and writes PDF with the base-14
// fonts plus a fetched Liberation Sans; folders arrive through the SDK's
// webkitGetAsEntry / webkitdirectory walk; the ZIP download is
// @unisim/media's STORED-only writer).
//
// ⚠️ `pdf` (our hosted copy at opensource.unisim.co.uk/kb/papers/) ONLY where
// the licence allows redistribution: IETF RFCs and the CC BY 4.0 author copy
// of the Opus paper. IEEE, ACM, AES, W3C, WHATWG, Apple, Ecma, OASIS,
// Microsoft, Unicode and PKWARE documents link out instead. The Brandenburg
// paper's university host timed out on every attempt, so it links to the
// Wayback Machine's capture of the same PDF; ACM's landing page for Heckbert
// bot-blocks curl, so that DOI was confirmed through doi.org's handle API and
// a Wayback capture.

const H264: Source = {
  kind: 'paper',
  title: 'Overview of the H.264/AVC Video Coding Standard',
  authors: 'Thomas Wiegand, Gary J. Sullivan, Gisle Bjøntegaard, Ajay Luthra',
  publisher: 'IEEE Transactions on Circuits and Systems for Video Technology',
  year: 2003,
  href: 'https://www.csd.uoc.gr/~hy474/bibliography/AVC_OverviewH.264.pdf',
}

const FLAC_RFC: Source = {
  kind: 'standard',
  title: 'Free Lossless Audio Codec (FLAC) (RFC 9639)',
  authors: 'Martijn van Beurden, Andrew Weaver',
  publisher: 'IETF',
  year: 2024,
  href: 'https://www.rfc-editor.org/rfc/rfc9639.html',
  pdf: 'papers/rfc-9639-flac.pdf',
  licence: 'IETF Trust — RFC, freely redistributable unmodified',
}

const WEBCODECS: Source = {
  kind: 'standard',
  title: 'WebCodecs — the browser\'s built-in video and audio encoders',
  publisher: 'W3C',
  year: 2026,
  href: 'https://www.w3.org/TR/webcodecs/',
}

const ZIP_APPNOTE: Source = {
  kind: 'standard',
  title: 'APPNOTE.TXT — .ZIP File Format Specification, version 6.3.10',
  publisher: 'PKWARE',
  year: 2022,
  href: 'https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT',
}

export const SOURCES: Record<string, Source[]> = {
  'what-is-a-file-format': [
    {
      kind: 'standard',
      title: 'MIME Sniffing Standard — how software reads a file\'s contents rather than trusting its name',
      publisher: 'WHATWG',
      year: 2026,
      href: 'https://mimesniff.spec.whatwg.org/',
    },
    {
      kind: 'standard',
      title: 'QuickTime File Format — the container MOV uses, and MP4 grew from',
      publisher: 'Apple',
      href: 'https://developer.apple.com/documentation/quicktime-file-format',
    },
    H264,
  ],
  'why-conversions-lose-things': [
    {
      kind: 'paper',
      title: 'MP3 and AAC Explained',
      authors: 'Karlheinz Brandenburg',
      publisher: 'AES International Conference on High-Quality Audio Coding',
      year: 1999,
      href: 'https://web.archive.org/web/20170808182543/http://www.lpi.tel.uva.es/~nacho/docencia/ing_ond_1/trabajos_01_02/formatos_audio_digital/archivos/3-1.pdf',
    },
    FLAC_RFC,
    {
      kind: 'standard',
      title: 'Graphics Interchange Format, Version 89a',
      publisher: 'CompuServe',
      year: 1990,
      href: 'https://www.w3.org/Graphics/GIF/spec-gif89a.txt',
    },
    {
      kind: 'paper',
      title: 'Color Image Quantization for Frame Buffer Display (median cut — how 256 colours are chosen for a GIF)',
      authors: 'Paul Heckbert',
      publisher: 'ACM SIGGRAPH',
      year: 1982,
      href: 'https://doi.org/10.1145/965145.801294',
    },
  ],
  'what-universal-converter-can-do': [
    {
      kind: 'paper',
      title: 'High-Quality, Low-Delay Music Coding in the Opus Codec',
      authors: 'Jean-Marc Valin, Gregory Maxwell, Timothy B. Terriberry, Koen Vos',
      publisher: 'AES Convention',
      year: 2013,
      href: 'https://arxiv.org/abs/1602.04845',
      pdf: 'papers/valin-2013-opus-music-coding.pdf',
      licence: 'CC BY 4.0 — Valin, Maxwell, Terriberry, Vos (authors\' version, arXiv:1602.04845)',
    },
    FLAC_RFC,
    {
      kind: 'standard',
      title: 'Audio Interchange File Format: "AIFF", Version 1.3',
      publisher: 'Apple Computer',
      year: 1989,
      href: 'https://www.mmsp.ece.mcgill.ca/Documents/AudioFormats/AIFF/Docs/AIFF-1.3.pdf',
    },
    WEBCODECS,
  ],
  'converting-documents': [
    {
      kind: 'standard',
      title: 'ECMA-376: Office Open XML File Formats (DOCX)',
      publisher: 'Ecma International',
      href: 'https://ecma-international.org/publications-and-standards/standards/ecma-376/',
    },
    {
      kind: 'standard',
      title: 'Open Document Format for Office Applications (OpenDocument) Version 1.3',
      publisher: 'OASIS',
      year: 2021,
      href: 'https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part1-introduction/OpenDocument-v1.3-os-part1-introduction.html',
    },
    {
      kind: 'standard',
      title: '[MS-DOC]: Word (.doc) Binary File Format',
      publisher: 'Microsoft',
      href: 'https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-doc/ccd7b486-7881-484c-a137-51170af7cc22',
    },
    {
      kind: 'standard',
      title: 'Unicode Standard Annex #9: Unicode Bidirectional Algorithm',
      publisher: 'Unicode Consortium',
      href: 'https://www.unicode.org/reports/tr9/',
    },
  ],
  'converting-folders': [
    {
      kind: 'standard',
      title: 'File and Directory Entries API — how a dropped folder is read',
      publisher: 'W3C WICG',
      year: 2025,
      href: 'https://wicg.github.io/entries-api/',
    },
    ZIP_APPNOTE,
  ],
  'your-files-stay-on-your-device': [
    {
      kind: 'paper',
      title: 'Local-first software: You own your data, in spite of the cloud',
      authors: 'Martin Kleppmann, Adam Wiggins, Peter van Hardenberg, Mark McGranaghan',
      publisher: 'ACM Onward!',
      year: 2019,
      href: 'https://www.inkandswitch.com/local-first/static/local-first.pdf',
    },
    {
      kind: 'paper',
      title: 'Bringing the Web up to Speed with WebAssembly — how the FLAC encoder and HEIC decoder run in the page',
      authors: 'Andreas Haas, Andreas Rossberg, Derek L. Schuff, Ben L. Titzer et al.',
      publisher: 'ACM PLDI',
      year: 2017,
      href: 'https://people.mpi-sws.org/~rossberg/papers/Haas,%20Rossberg,%20Schuff,%20Titzer,%20Gohman,%20Wagner,%20Zakai,%20Bastien,%20Holman%20-%20Bringing%20the%20Web%20up%20to%20Speed%20with%20WebAssembly.pdf',
    },
    WEBCODECS,
  ],
}
