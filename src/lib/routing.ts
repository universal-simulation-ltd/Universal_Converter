import type { MediaKind } from './types'

/**
 * Which tab is showing. NOT `MediaKind`, on purpose: `MediaKind` is also the
 * discriminator on every queue item, so widening it to fit an 'all' tab would
 * leak a fifth case into `QueueItem.kind`, `acceptsOn`, `convertAll` and
 * `downloadAll` — none of which have anything to convert for it. The All tab
 * owns no queue; it sorts a drop and hands each file to a real tab.
 */
export type TabId = MediaKind | 'all'

/**
 * Where a drop should leave the person.
 *
 * Pure, and in its own module, because this is a rule about somebody's
 * attention rather than about files — the sort of thing that is obvious while
 * you are writing it and silently wrong six weeks later. The store calls it
 * once, `scripts/selftest.mjs` pins every case, and nothing else has an opinion.
 *
 * The three rules, in the order they fire:
 *
 *  1. **A single-kind drop onto an empty All tab goes straight to that studio.**
 *     There is exactly one destination, so asking "which tab?" is asking a
 *     question that has already been answered. This is the whole point: on a
 *     phone, picking one photo used to land you on a screen whose only job was
 *     to tell you to press Images.
 *
 *  2. **More of the same kind never moves anybody.** Adding a second photo on
 *     the Images tab is the ordinary case, and a tab switch there would be the
 *     app taking the wheel mid-edit. This also protects a tab chosen BY HAND:
 *     somebody who tapped Audio and then added audio stays on Audio, whatever
 *     else is queued behind them.
 *
 *  3. **A file of a DIFFERENT kind sends you back to All.** Once the queue
 *     spans two studios, no single studio shows the whole of it, and All is the
 *     screen that says where everything went. (James, 2026-08-30: "they can
 *     always add another item and then take them to the multi file info".)
 *
 * ⚠️ `hadItems` is what separates the empty-queue case from the
 * add-to-an-existing-queue case, and rule 1 deliberately needs it. Somebody
 * sitting on All with files already sorted is looking at the sorting column on
 * purpose; dropping one more picture is not a reason to take it away from them.
 */
export function tabAfterDrop({
  from,
  hadItems,
  landedOn,
  rejected = false,
}: {
  /** The tab the files were dropped on. */
  from: TabId
  /** Was anything already queued, anywhere, before this drop? */
  hadItems: boolean
  /** The kinds that actually got a row out of this drop. */
  landedOn: readonly MediaKind[]
  /**
   * True when the sorter turned a file away. The "Not converted: …" notice
   * lives on the All tab, so a drop with something to explain does not navigate
   * away from the only screen that explains it.
   */
  rejected?: boolean
}): TabId {
  const kinds = new Set(landedOn)
  // Nothing landed — a drop of files the app cannot read at all. Never move.
  if (kinds.size === 0) return from

  if (from === 'all') {
    if (rejected) return 'all'
    if (!hadItems && kinds.size === 1) return [...kinds][0]
    return 'all'
  }

  if (kinds.size === 1 && kinds.has(from)) return from
  return 'all'
}
