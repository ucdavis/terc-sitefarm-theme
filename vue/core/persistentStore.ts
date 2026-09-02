/**
 * Cold cache tier — decoded grids that survive a reload (TERC-48).
 *
 * Past model hours and precomputed wave buckets never change, so once
 * they've been downloaded and decoded there is no reason to pay for either
 * again. The in-memory LRU stays the hot tier; this sits underneath it and
 * turns a cold reload (or a kiosk's periodic refresh) from seconds of
 * downloading and parsing into a local read.
 *
 * IndexedDB lives behind this interface, the same way Leaflet lives behind
 * the map engine: `indexedDbStore.ts` is the only file that touches it, and
 * tests drive a fake. Every operation is best-effort — storage can be
 * absent, blocked (private browsing, enterprise policy), full, or corrupt,
 * and none of that may break rendering. A failing store degrades to a
 * network fetch, which is exactly what happened before this tier existed.
 */

export interface PersistentStore {
  /** Cached value, or undefined for a miss, a stale format, or any error. */
  get(key: string): Promise<unknown | undefined>
  /** Best-effort write; resolves even when the write was dropped. */
  put(key: string, value: unknown, bytes: number): Promise<void>
  /** Drop everything — used when the stored format is superseded. */
  clear(): Promise<void>
}

/**
 * Bump when the SHAPE or MEANING of a persisted value changes: units,
 * grid orientation, the NaN-means-land convention, the ScalarGrid fields.
 * Rows written under a different version are ignored and deleted, so a
 * decode change can never be served stale from a visitor's disk — the one
 * failure mode of a persistent cache that users cannot clear themselves.
 */
export const FORMAT_VERSION = 1

/** Roughly 25 model grids (142 KB) plus a handful of wave grids (2.3 MB). */
export const MAX_BYTES = 64 * 1024 * 1024

/** Store used when persistence is unavailable — every read is a miss. */
export const nullStore: PersistentStore = {
  async get() {
    return undefined
  },
  async put() {},
  async clear() {},
}
