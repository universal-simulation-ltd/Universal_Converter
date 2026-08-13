// ---------------------------------------------------------------------------
// The XML helpers the DOCX and ODT readers share.
//
// Both formats are namespaced XML with a prefix on every single tag — `w:p`,
// `text:h` — and both are read with the browser's own `DOMParser`, which is
// namespace-aware and already in the page.
//
// ⚠️ MATCH ON localName, NEVER ON THE PREFIX. `getElementsByTagName('w:p')`
// works on every file Word itself writes and then fails on one from Pages,
// Google Docs or a server-side generator that bound the same namespace to a
// different prefix. The prefix is a local nickname; the namespace URI is the
// name. These helpers take the URI, so the readers cannot make that mistake.
// ---------------------------------------------------------------------------

export function parseXml(source: string, what: string): Document {
  const doc = new DOMParser().parseFromString(source, 'application/xml')
  // DOMParser does not throw. It returns a document whose root is
  // <parsererror>, which every caller would otherwise treat as an empty file
  // and hand back a blank page for.
  const failed = doc.getElementsByTagName('parsererror')[0]
  if (failed) throw new Error(`The ${what} inside this file is damaged and can’t be read.`)
  return doc
}

/** Direct children in a namespace, by local name. */
export function children(parent: Element | Document, ns: string, local: string): Element[] {
  const out: Element[] = []
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType !== 1) continue
    const el = node as Element
    if (el.localName === local && el.namespaceURI === ns) out.push(el)
  }
  return out
}

/** The first direct child in a namespace, by local name. */
export function child(parent: Element | Document, ns: string, local: string): Element | null {
  return children(parent, ns, local)[0] ?? null
}

/** Every descendant in a namespace, by local name, in document order. */
export function descendants(root: Element | Document, ns: string, local: string): Element[] {
  return Array.from(root.getElementsByTagNameNS(ns, local))
}

/** The first descendant in a namespace, by local name. */
export function descendant(root: Element | Document, ns: string, local: string): Element | null {
  return root.getElementsByTagNameNS(ns, local)[0] ?? null
}

export function attr(el: Element | null, ns: string, name: string): string | null {
  if (!el) return null
  const value = el.getAttributeNS(ns, name)
  if (value !== null) return value
  // Some producers write namespaced attributes without declaring the prefix
  // properly, which leaves them un-namespaced in the parsed tree. Falling back
  // to a local-name scan costs nothing and rescues those files.
  for (const candidate of Array.from(el.attributes)) {
    if (candidate.localName === name) return candidate.value
  }
  return null
}

/**
 * Whether an on/off element means on.
 *
 * OOXML's booleans are three-valued and the trap is that ABSENT ATTRIBUTE MEANS
 * TRUE: `<w:b/>` is bold, and `<w:b w:val="0"/>` is not. Reading the attribute
 * and testing it for truthiness — the obvious thing — makes every bold run in
 * every Word document come out plain.
 */
export function onOff(el: Element | null, ns: string): boolean {
  if (!el) return false
  const value = attr(el, ns, 'val')
  if (value === null) return true
  return value !== '0' && value !== 'false' && value !== 'off'
}

/** All text under a node, with no formatting — used for cells and headings. */
export function textContentOf(el: Element | null): string {
  return el?.textContent ?? ''
}
