// ---------------------------------------------------------------------------
// RichDoc → plain text, HTML and Markdown.
//
// The three "keep the words, change the wrapper" targets, together because they
// are the same walk over the model with a different rendering of each block —
// and splitting them across three files would mean three copies of that walk.
//
// None of them can carry an image, so all three name it in the same way: the
// alt text where there is one, and a marker where there is not. A picture
// silently vanishing is the thing that makes somebody re-do the conversion by
// hand to find out what was there.
// ---------------------------------------------------------------------------

import { runsToText, type RichDoc, type Run } from '../model'

// ── Plain text ───────────────────────────────────────────────────────────────

export function docToText(doc: RichDoc): string {
  const out: string[] = []

  for (const block of doc.blocks) {
    switch (block.kind) {
      case 'heading': {
        const line = runsToText(block.runs)
        out.push(line)
        // A heading with nothing marking it as one is invisible in plain text,
        // so it is underlined the way a README does it.
        out.push((block.level === 1 ? '=' : '-').repeat(Math.min(line.length, 72)))
        out.push('')
        break
      }
      case 'paragraph':
        out.push(runsToText(block.runs), '')
        break
      case 'quote':
        for (const line of runsToText(block.runs).split('\n')) out.push(`> ${line}`)
        out.push('')
        break
      case 'list': {
        let counter = 0
        for (const item of block.items) {
          counter += 1
          const indent = '  '.repeat(item.level)
          const marker = block.ordered ? `${counter}.` : '-'
          out.push(`${indent}${marker} ${runsToText(item.runs).replace(/\n/g, ' ')}`)
        }
        out.push('')
        break
      }
      case 'code':
        out.push(block.text, '')
        break
      case 'rule':
        out.push('-'.repeat(72), '')
        break
      case 'table':
        out.push(...textTable(block.header, block.rows), '')
        break
      case 'image':
        out.push(`[image${block.alt ? `: ${block.alt}` : ''}]`, '')
        break
      case 'pagebreak':
        out.push('', '- - -', '')
        break
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * A table as aligned columns.
 *
 * Padded to the widest cell per column rather than left as tab-separated: a tab
 * lines up only if every cell is shorter than one tab stop, which is almost
 * never, and a table that nearly lines up is harder to read than one that does
 * not try.
 */
function textTable(header: Run[][] | null, rows: readonly Run[][][]): string[] {
  const all = header ? [header, ...rows] : [...rows]
  if (!all.length) return []
  const columns = Math.max(...all.map((r) => r.length))
  const cells = all.map((row) =>
    Array.from({ length: columns }, (_, c) => runsToText(row[c] ?? []).replace(/\n/g, ' ')),
  )
  const widths = Array.from({ length: columns }, (_, c) =>
    Math.min(40, Math.max(...cells.map((row) => row[c].length))),
  )

  const line = (row: string[]) =>
    row.map((cell, c) => cell.padEnd(widths[c]).slice(0, Math.max(widths[c], cell.length))).join('  ').trimEnd()

  const out = cells.map(line)
  if (header) out.splice(1, 0, widths.map((w) => '-'.repeat(w)).join('  '))
  return out
}

// ── HTML ─────────────────────────────────────────────────────────────────────

export function docToHtml(doc: RichDoc): string {
  const body: string[] = []

  for (const block of doc.blocks) {
    switch (block.kind) {
      case 'heading':
        body.push(`<h${block.level}>${inlineHtml(block.runs)}</h${block.level}>`)
        break
      case 'paragraph':
        body.push(`<p>${inlineHtml(block.runs)}</p>`)
        break
      case 'quote':
        body.push(`<blockquote><p>${inlineHtml(block.runs)}</p></blockquote>`)
        break
      case 'list':
        body.push(nestedListHtml(block.items, block.ordered))
        break
      case 'code':
        body.push(`<pre><code>${escapeHtml(block.text)}</code></pre>`)
        break
      case 'rule':
        body.push('<hr>')
        break
      case 'table': {
        const rows: string[] = []
        if (block.header) {
          rows.push(`<thead><tr>${block.header.map((c) => `<th>${inlineHtml(c)}</th>`).join('')}</tr></thead>`)
        }
        rows.push(
          `<tbody>${block.rows
            .map((row) => `<tr>${row.map((c) => `<td>${inlineHtml(c)}</td>`).join('')}</tr>`)
            .join('')}</tbody>`,
        )
        body.push(`<table>${rows.join('')}</table>`)
        break
      }
      case 'image':
        body.push(`<p><em>[image${block.alt ? `: ${escapeHtml(block.alt)}` : ''}]</em></p>`)
        break
      case 'pagebreak':
        // Meaningful when the page is printed and invisible when it is read,
        // which is exactly right for a page break in a web page.
        body.push('<hr style="page-break-after:always;border:0">')
        break
    }
  }

  const title = escapeHtml(doc.title ?? 'Document')
  // A complete, standalone document — not a fragment. Somebody converting to
  // HTML wants a file they can open, and a bare <p> soup opens as unstyled
  // black Times on white in a browser that has guessed the encoding.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 46rem; margin: 3rem auto; padding: 0 1.25rem;
         font: 16px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif;
         color: #1f2937; background: #fff; }
  @media (prefers-color-scheme: dark) { body { color: #e5e7eb; background: #111827; } }
  h1, h2, h3, h4 { line-height: 1.25; margin: 2rem 0 .6rem; }
  h1 { font-size: 2rem; } h2 { font-size: 1.5rem; } h3 { font-size: 1.2rem; }
  p, ul, ol, blockquote, table, pre { margin: 0 0 1rem; }
  blockquote { border-left: 3px solid #ea580c; margin-left: 0; padding-left: 1rem; color: #4b5563; }
  code { background: rgba(127,127,127,.14); padding: .1em .35em; border-radius: .25rem; font-size: .9em; }
  pre { background: rgba(127,127,127,.1); padding: 1rem; border-radius: .5rem; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; }
  th, td { border: 1px solid rgba(127,127,127,.35); padding: .45rem .6rem; text-align: left; }
  th { background: rgba(127,127,127,.1); }
  a { color: #2563eb; }
  hr { border: 0; border-top: 1px solid rgba(127,127,127,.35); margin: 2rem 0; }
</style>
</head>
<body>
${body.join('\n')}
</body>
</html>
`
}

function nestedListHtml(items: readonly { runs: Run[]; level: number }[], ordered: boolean): string {
  const tag = ordered ? 'ol' : 'ul'
  const out: string[] = [`<${tag}>`]
  let depth = 0

  for (const item of items) {
    const level = Math.max(0, item.level)
    while (depth < level) { out.push(`<${tag}>`); depth += 1 }
    while (depth > level) { out.push(`</${tag}>`); depth -= 1 }
    out.push(`<li>${inlineHtml(item.runs)}</li>`)
  }
  while (depth > 0) { out.push(`</${tag}>`); depth -= 1 }

  out.push(`</${tag}>`)
  return out.join('')
}

function inlineHtml(runs: readonly Run[]): string {
  return runs
    .map((run) => {
      let html = escapeHtml(run.text).replace(/\n/g, '<br>')
      if (run.code) html = `<code>${html}</code>`
      if (run.bold) html = `<strong>${html}</strong>`
      if (run.italic) html = `<em>${html}</em>`
      if (run.underline) html = `<u>${html}</u>`
      if (run.strike) html = `<s>${html}</s>`
      if (run.link) html = `<a href="${escapeAttribute(run.link)}">${html}</a>`
      return html
    })
    .join('')
}

/**
 * ⚠️ Every string from a converted document goes through here.
 *
 * The input is somebody else's file, and a `.docx` containing the literal text
 * `<script>…` must come out as text on the page rather than as a script tag in
 * the file we hand back. `&` first, or the escapes escape each other.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** As above, plus the quotes that would otherwise close the attribute. */
function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ── Markdown ─────────────────────────────────────────────────────────────────

export function docToMarkdown(doc: RichDoc): string {
  const out: string[] = []

  for (const block of doc.blocks) {
    switch (block.kind) {
      case 'heading':
        out.push(`${'#'.repeat(block.level)} ${inlineMarkdown(block.runs)}`, '')
        break
      case 'paragraph':
        // Two trailing spaces is markdown's own line break, so a `<w:br/>`
        // inside a Word paragraph stays a break rather than becoming a space.
        out.push(inlineMarkdown(block.runs).replace(/\n/g, '  \n'), '')
        break
      case 'quote':
        for (const line of inlineMarkdown(block.runs).split('\n')) out.push(`> ${line}`)
        out.push('')
        break
      case 'list': {
        let counter = 0
        for (const item of block.items) {
          counter += 1
          out.push(
            `${'  '.repeat(item.level)}${block.ordered ? `${counter}.` : '-'} ` +
            inlineMarkdown(item.runs).replace(/\n/g, ' '),
          )
        }
        out.push('')
        break
      }
      case 'code':
        // A fence long enough to contain any backticks in the code itself —
        // otherwise a snippet about markdown closes its own block.
        out.push(fenceFor(block.text), block.text, fenceFor(block.text), '')
        break
      case 'rule':
        out.push('---', '')
        break
      case 'table': {
        const columns = Math.max(
          block.header?.length ?? 0,
          ...block.rows.map((r) => r.length),
          1,
        )
        const row = (cells: Run[][]) =>
          `| ${Array.from({ length: columns }, (_, c) =>
            inlineMarkdown(cells[c] ?? []).replace(/\n/g, ' ').replace(/\|/g, '\\|'),
          ).join(' | ')} |`
        // Markdown tables REQUIRE a header row — a table with none renders as
        // literal pipes — so an empty one is written when the source had none.
        out.push(row(block.header ?? Array.from({ length: columns }, () => [])))
        out.push(`|${' --- |'.repeat(columns)}`)
        for (const r of block.rows) out.push(row(r))
        out.push('')
        break
      }
      case 'image':
        out.push(`![${block.alt}]()`, '')
        break
      case 'pagebreak':
        out.push('', '---', '')
        break
    }
  }

  const front = doc.title ? '' : ''
  return front + out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

function fenceFor(code: string): string {
  const longest = Math.max(0, ...[...code.matchAll(/`+/g)].map((m) => m[0].length))
  return '`'.repeat(Math.max(3, longest + 1))
}

function inlineMarkdown(runs: readonly Run[]): string {
  return runs
    .map((run) => {
      // Code first and alone: markdown does not apply emphasis inside a code
      // span, so wrapping one in asterisks writes the asterisks out literally.
      if (run.code) return `\`${run.text}\``
      let text = escapeMarkdown(run.text)
      if (run.bold && run.italic) text = `***${text}***`
      else if (run.bold) text = `**${text}**`
      else if (run.italic) text = `*${text}*`
      if (run.strike) text = `~~${text}~~`
      if (run.link) text = `[${text}](${run.link})`
      return text
    })
    .join('')
}

/**
 * Escape the characters that would otherwise become markup.
 *
 * Only where they could actually be read as markup: escaping every `*` and `_`
 * everywhere produces backslashes all through ordinary prose, and a converted
 * document full of `\_` is worse than one where a stray underscore italicises
 * two words.
 */
function escapeMarkdown(text: string): string {
  return text
    .replace(/([\\`])/g, '\\$1')
    .replace(/^(\s*)([-*+>#])/gm, '$1\\$2')
    .replace(/^(\s*\d+)\./gm, '$1\\.')
}
