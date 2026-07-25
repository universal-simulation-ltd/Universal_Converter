// Copy libflacjs's wasm build into public/flac/ so it can be loaded at runtime
// rather than bundled.
//
// Why not a normal import: libflacjs ships emscripten glue in UMD form, and the
// glue resolves its .wasm relative to itself. Bundling it means fighting that
// resolution in dev and in the build; loading the glue as a plain <script> with
// `FLAC_SCRIPT_LOCATION` set is what the library itself expects, and it keeps
// ~230 KB out of the main bundle — it only downloads when someone converts to
// FLAC.
//
// Copied on predev/prebuild rather than committed, so the files can never drift
// from the installed dependency version. public/flac/ is gitignored.

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const from = join(root, 'node_modules', 'libflacjs', 'dist')
const to = join(root, 'public', 'flac')

const FILES = ['libflac.min.wasm.js', 'libflac.min.wasm.wasm']

mkdirSync(to, { recursive: true })
for (const file of FILES) {
  copyFileSync(join(from, file), join(to, file))
}

const { version } = JSON.parse(readFileSync(join(root, 'node_modules', 'libflacjs', 'package.json'), 'utf8'))
console.log(`sync-flac: copied libflacjs@${version} (${FILES.join(', ')}) → public/flac/`)
