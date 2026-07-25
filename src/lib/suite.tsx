import { DEFAULT_UNIVERSAL_APPS_PRODUCTS, type SuiteProduct } from '@unisim/sdk'

// The suite-switcher glyph for this app, on the shared 32-unit frame: slate tile
// (rx 7), orange strokes at 2.2, waveform fills in the lighter orange — the same
// construction as Recorder, Polling and Signatures.
//
// This lives here only until it ships in @unisim/sdk's own catalogue. Move it
// there (as CONVERTER_GLYPH in SuiteSwitcher.tsx), delete this file, and drop
// the `products` prop in App.tsx — the entry below is the exact shape to add.
export const CONVERTER_GLYPH = (
  <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="7" fill="#0f172a" />
    <g fill="none" stroke="#fe8c01" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 13.1A8.5 8.5 0 0 1 24 13.1" />
      <path d="M21.2 11.6 24 13.1 22.6 16" />
      <path d="M24 18.9A8.5 8.5 0 0 1 8 18.9" />
      <path d="M10.8 20.4 8 18.9 9.4 16" />
    </g>
    <g fill="#ff9a1f">
      <rect x="12.6" y="13.6" width="1.8" height="4.8" rx="0.9" />
      <rect x="15.1" y="11.4" width="1.8" height="9.2" rx="0.9" />
      <rect x="17.6" y="14.2" width="1.8" height="3.6" rx="0.9" />
    </g>
  </svg>
)

export const CONVERTER_PRODUCT: SuiteProduct = {
  id: 'converter',
  name: 'Universal Converter',
  desc: 'Convert audio & video without uploading a thing',
  href: 'https://opensource.unisim.co.uk/converter',
  glyph: CONVERTER_GLYPH,
  category: 'everyday',
}

/** The apps catalogue, with this product spliced in until the SDK carries it. */
export const APP_PRODUCTS: SuiteProduct[] = [...DEFAULT_UNIVERSAL_APPS_PRODUCTS, CONVERTER_PRODUCT]
