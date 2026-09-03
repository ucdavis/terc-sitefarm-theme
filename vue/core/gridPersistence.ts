/**
 * Wires the cold tier to the grid cache (TERC-48).
 *
 * Kept out of cache.ts so that module stays storage-agnostic and its
 * tests need no IndexedDB, and out of the data modules so nothing that
 * decodes grids has an opinion about where they're stored. Entry bundles
 * call this once; blocks that never touch grids never open a database.
 */
import { gridCache } from './cache'
import { createIndexedDbStore } from './indexedDbStore'
import type { ScalarGrid } from '../data/gridDecode'

/**
 * Stored size of a decoded grid. The Float64Array dominates — a 174×102
 * model grid is ~142 KB, a 695×406 wave grid ~2.3 MB — so the handful of
 * scalar fields alongside it aren't worth measuring.
 */
function gridBytes(value: unknown): number {
  const grid = value as Partial<ScalarGrid> | null
  return grid?.values?.byteLength ?? 0
}

let attached = false

export function enableGridPersistence(): void {
  if (attached) return
  attached = true
  gridCache.attachPersistence({ store: createIndexedDbStore(), bytesOf: gridBytes })
}
