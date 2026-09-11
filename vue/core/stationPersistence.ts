/**
 * Wires the cold tier to the station cache (TERC-70).
 *
 * Two things land on disk: historical windows (TTL.FOREVER entries — a
 * 30-day Water Quality range never changes once the day is over) through
 * the ordinary cache path, and the "last known reading" rows the station
 * fetchers remember explicitly (DataCache.putStored), which let the page
 * paint at once and say "checked 1:18 PM" while a slow API is queued.
 * Same IndexedDB as the grids; blocks that never read stations never
 * call this.
 */
import { stationCache } from './cache'
import { createIndexedDbStore } from './indexedDbStore'

/** Records are small objects; a JSON length is a fair size estimate. */
function recordBytes(value: unknown): number {
  try {
    return JSON.stringify(value).length
  } catch {
    return 0
  }
}

let attached = false

export function enableStationPersistence(): void {
  if (attached) return
  attached = true
  stationCache.attachPersistence({ store: createIndexedDbStore(), bytesOf: recordBytes })
}
