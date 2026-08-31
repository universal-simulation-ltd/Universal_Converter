// Handing a finished file to the user — the one step that is genuinely
// different on a phone.
//
// ⚠️ In a Capacitor WKWebView the `download` attribute is IGNORED. Not
// refused, not errored: the anchor is clicked, nothing happens, and no
// exception reaches the console. So the browser path below cannot be the only
// one, or every export button in the app is dead on iOS while looking fine in
// every test that runs in a real browser.
//
// iOS expects the share sheet instead, which is also what someone on a phone
// actually wants — Save to Files, Save to Photos, or straight into a message.
// There is no "Downloads folder" on the device to save to.
//
// The plugins are imported dynamically so they never reach the web bundle,
// which has a working path of its own and would otherwise pay for code that
// can only no-op in a browser. Same reasoning as `nativeOpen.ts` in
// Universal PDF.

/**
 * True inside a Capacitor WebView. Reads the global the native runtime injects
 * rather than importing `@capacitor/core`, so the web build does not gain a
 * dependency just to answer "am I native?".
 */
export function isNativeShell(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  try {
    return cap?.isNativePlatform?.() === true
  } catch {
    return false
  }
}

/** `data:<mime>;base64,<payload>` — Filesystem wants the payload alone. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

async function shareNative(blob: Blob, filename: string): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  // Cache, not Documents: this is a hand-off to the share sheet, not a file the
  // app is keeping. Writing to Documents would quietly accumulate every export
  // the user ever made in a folder they can see over iTunes/Finder.
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  })
  await Share.share({ files: [uri] })
}

function downloadInBrowser(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a tick to start the download before reclaiming memory.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Save `blob` as `filename` — a download in a browser, the share sheet on a
 * phone.
 *
 * Deliberately returns `void` rather than a Promise: every call site is a
 * click handler that fires and forgets, and making it awaitable would only
 * invite callers to block a button on a sheet the user may never dismiss.
 */
export function saveBlob(blob: Blob, filename: string): void {
  if (!isNativeShell()) {
    downloadInBrowser(blob, filename)
    return
  }
  shareNative(blob, filename).catch((err: unknown) => {
    // Dismissing the share sheet rejects. That is the user saying no, not a
    // failure, and it must not surface as one.
    const message = err instanceof Error ? err.message : String(err)
    if (/cancel/i.test(message)) return
    console.error('Could not share the file', err)
  })
}

// ── Choosing WHERE the file goes ─────────────────────────────────────────────

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<{
    createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>
  }>
}

/**
 * Can this browser ask the user WHERE to put the file?
 *
 * ⚠️ Exported so the button can be LABELLED honestly. `showSaveFilePicker` is
 * Chromium-only — Firefox and Safari have shipped neither, and there is no
 * polyfill, because no web API outside this one can raise a file dialog. A
 * button that said "Open save dialog…" and then dropped the file into the
 * downloads folder anyway would be worse than the plain label it replaced, so
 * the caller asks first and says what it will actually do.
 *
 * Native shells are excluded on purpose even though they can save anywhere: the
 * share sheet IS their save dialog, `saveBlob` already raises it, and it is not
 * a thing that can be feature-detected from in here.
 */
export function canPickSaveLocation(): boolean {
  if (isNativeShell()) return false
  return typeof (window as unknown as SaveFilePickerWindow).showSaveFilePicker === 'function'
}

/**
 * Save `blob`, letting the user pick the folder and the name.
 *
 * Falls back to `saveBlob` wherever the picker does not exist, so the file
 * always lands somewhere — but see `canPickSaveLocation` before promising a
 * dialog in a label.
 *
 * ⚠️ TRANSIENT USER ACTIVATION. `showSaveFilePicker` throws unless it is
 * reached from a click, and an `await` before it spends the activation. So it
 * is the FIRST thing this function does — everything that could be prepared
 * beforehand (the name, the accept types) is computed from arguments already in
 * hand. Do not add an `await` above it.
 */
export async function saveBlobAs(blob: Blob, filename: string): Promise<void> {
  const pick = (window as unknown as SaveFilePickerWindow).showSaveFilePicker
  if (!canPickSaveLocation() || !pick) {
    saveBlob(blob, filename)
    return
  }

  const dot = filename.lastIndexOf('.')
  const ext = dot > 0 ? filename.slice(dot) : ''
  try {
    const handle = await pick({
      suggestedName: filename,
      // Without this the dialog offers no extension and some platforms save the
      // file without one. Guarded on both halves being known: a blob with no
      // MIME type or a name with no extension gets an unfiltered dialog, which
      // is correct rather than a made-up filter.
      types: blob.type && ext
        ? [{ description: 'File', accept: { [blob.type]: [ext] } }]
        : undefined,
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
  } catch (err: unknown) {
    // Cancelling the dialog rejects with AbortError. That is the user saying
    // no — the same case the share sheet has above — and it must not fall
    // through to a download, or "cancel" would put the file in the downloads
    // folder, which is precisely what they declined.
    const name = err instanceof Error ? err.name : ''
    if (name === 'AbortError' || name === 'NotAllowedError') return
    // Anything else IS a failure to save, and the file still matters more than
    // the folder — fall back rather than losing it silently.
    console.error('Could not save to the chosen folder; using the downloads folder', err)
    saveBlob(blob, filename)
  }
}
