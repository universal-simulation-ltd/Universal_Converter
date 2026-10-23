// Run the browser specs in `e2e/` one process each — the CI entry point, and
// handy locally too. Follows Universal PDF's e2e/run-all.mjs.
//
//   node e2e/run-all.mjs                  # every spec except those in SKIP
//   node e2e/run-all.mjs files queue      # just these (names without .e2e.mjs)
//
// Each spec starts its own Vite dev server on a free port (see
// startDevServer in each), so nothing needs to be running first.
//
// Options: --jobs N (default 2), --timeout S per spec (default 300),
// --retries N (default 1). Each spec's full output goes to
// $E2E_RESULTS/<name>.log (default: a folder in the OS temp dir; CI sets it
// and uploads the folder when a run fails), and the summary prints the last
// lines of every failure.
//
// A spec that fails and then passes on its retry is reported as FLAKY and
// does not fail the run; one that fails every attempt does. The retry exists
// because a shared GitHub runner is slower and noisier than a laptop, not to
// hide a real failure: a spec that is flaky every time belongs in SKIP with a
// reason, where it is visible, rather than retried into green.

import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = process.env.E2E_RESULTS ?? join(tmpdir(), 'universal-converter-e2e')

// Specs this runner never starts, each with the reason. Remove a line once the
// reason is gone — that is the whole fix-up list for e2e in CI.
export const SKIP = {}

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return dflt
  const v = args[i + 1]
  args.splice(i, 2)
  return Number(v)
}
const jobs = opt('jobs', 2)
const timeoutS = opt('timeout', 300)
const retries = opt('retries', 1)
const named = args.filter((a) => !a.startsWith('--'))

const all = readdirSync(HERE)
  .filter((f) => f.endsWith('.e2e.mjs'))
  .map((f) => f.slice(0, -'.e2e.mjs'.length))
  .sort()
const skipped = named.length ? [] : all.filter((n) => SKIP[n])
const specs = named.length ? named : all.filter((n) => !SKIP[n])
for (const n of specs) {
  if (!all.includes(n)) {
    console.error(`no such spec: e2e/${n}.e2e.mjs`)
    process.exit(2)
  }
}

mkdirSync(OUT, { recursive: true })
console.log(`${specs.length} spec(s), ${jobs} at a time`)
for (const n of skipped) console.log(`  skip ${n}: ${SKIP[n]}`)

function runOnce(name) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(process.execPath, [join(HERE, `${name}.e2e.mjs`)], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutS * 1000)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        ok: code === 0 && !timedOut,
        code: timedOut ? `timed out after ${timeoutS}s` : `exit ${code}`,
        secs: Math.round((Date.now() - started) / 1000),
        out,
      })
    })
  })
}

const results = {}
async function run(name) {
  let log = ''
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await runOnce(name)
    log += `===== attempt ${attempt + 1}: ${r.code}, ${r.secs}s\n${r.out}\n`
    if (r.ok) {
      results[name] = { status: attempt ? 'FLAKY' : 'pass', secs: r.secs }
      break
    }
    results[name] = { status: 'FAIL', secs: r.secs, code: r.code, tail: r.out.trim().split('\n').slice(-25).join('\n') }
  }
  writeFileSync(join(OUT, `${name}.log`), log)
  const r = results[name]
  console.log(`${r.status.padEnd(5)} ${String(r.secs).padStart(4)}s  ${name}`)
}

const queue = [...specs]
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length) await run(queue.shift())
  }),
)

const failed = specs.filter((n) => results[n].status === 'FAIL')
const flaky = specs.filter((n) => results[n].status === 'FLAKY')
console.log(`\n${specs.length - failed.length - flaky.length} passed, ${flaky.length} flaky (passed on retry), ${failed.length} failed`)
for (const n of failed) console.log(`\n── ${n} (${results[n].code}) ──\n${results[n].tail}`)
process.exit(failed.length ? 1 : 0)
