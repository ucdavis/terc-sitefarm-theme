import { reactive } from 'vue'
import type { PersistentStore } from './persistentStore'

/**
 * The shared cache — used by every data module in both phases.
 *
 *  - Keys are `source + identifier + timeRange` strings built by callers.
 *  - Values are DECODED, NORMALIZED results (units already converted, .npy
 *    already parsed). A cache hit never re-parses or re-converts anything.
 *  - Concurrent requests for the same key join the same in-flight promise.
 *  - TTL: TTL.SHORT (~5 min) for "current" data, TTL.FOREVER for historical
 *    windows and past model hours (those never change).
 *  - LRU eviction with a per-cache entry cap keeps decoded grids
 *    (142–284 KB each) from growing without bound.
 *  - Hit/miss/join counters are reactive and rendered by CacheDevOverlay.
 */

export const TTL = {
  SHORT: 5 * 60_000,
  FOREVER: Number.POSITIVE_INFINITY,
} as const

export interface CacheEvent {
  kind: 'hit' | 'miss' | 'join' | 'evict' | 'prefetch' | 'disk'
  key: string
  at: number
}

export const cacheStats = reactive({
  hits: 0,
  misses: 0,
  joins: 0,
  evictions: 0,
  prefetches: 0,
  /** Served from the persistent tier: no download, no decode (TERC-48). */
  diskHits: 0,
  diskWrites: 0,
  entries: 0,
  inflight: 0,
  events: [] as CacheEvent[],
})

function record(kind: CacheEvent['kind'], key: string) {
  cacheStats.events.unshift({ kind, key, at: Date.now() })
  if (cacheStats.events.length > 12) cacheStats.events.pop()
}

interface Entry {
  value: unknown
  expiresAt: number
}

const allCaches: DataCache[] = []

function refreshCounts() {
  cacheStats.entries = allCaches.reduce((n, c) => n + c.size, 0)
  cacheStats.inflight = allCaches.reduce((n, c) => n + c.inflightCount, 0)
}

/**
 * Optional cold tier beneath the in-memory LRU (TERC-48). Only entries
 * cached FOREVER are eligible: those are the immutable ones (past model
 * hours, precomputed wave buckets). Anything with a real TTL is volatile
 * by definition — persisting the manifest or a wind forecast would mean
 * serving a stale window after a reload, which is the opposite of the
 * point.
 */
export interface CachePersistence {
  store: PersistentStore
  /** Approximate stored size, for the tier's own eviction budget. */
  bytesOf: (value: unknown) => number
}

export class DataCache {
  // Map preserves insertion order -> oldest-first makes a cheap LRU.
  private entries = new Map<string, Entry>()
  private inflight = new Map<string, Promise<unknown>>()
  private persistence: CachePersistence | null = null
  /**
   * Keys whose persisted row is being dropped. The store delete is async,
   * so without this a getOrFetch issued right after delete() could read
   * the row back before the deletion lands — resurrecting exactly the
   * value the caller invalidated.
   */
  private dropping = new Set<string>()

  constructor(
    public readonly name: string,
    private readonly maxEntries = Number.POSITIVE_INFINITY,
  ) {
    allCaches.push(this)
  }

  get size() {
    return this.entries.size
  }
  get inflightCount() {
    return this.inflight.size
  }

  /** Synchronous lookup. Returns the cached value without counting a hit —
   *  used by views to render instantly (no loading flash) on revisit.
   *  Refreshes the entry's LRU recency (so peek-only access can't be
   *  evicted out from under a hot view), but never touches hit/miss stats.
   *  Note has() delegates here, so existence probes also refresh recency. */
  peek<T>(key: string): T | undefined {
    const e = this.entries.get(key)
    if (!e) return undefined
    if (e.expiresAt <= Date.now()) {
      this.entries.delete(key)
      refreshCounts()
      return undefined
    }
    this.entries.delete(key)
    this.entries.set(key, e)
    return e.value as T
  }

  has(key: string): boolean {
    return this.peek(key) !== undefined
  }

  /**
   * Give this cache a cold tier. Wired at the entry point rather than in
   * this module so cache.ts stays storage-agnostic and tests attach a
   * fake. Attaching is idempotent; pass null to detach.
   */
  attachPersistence(p: CachePersistence | null): void {
    this.persistence = p
  }

  /** Drop one entry (and any in-flight join for it) so the next getOrFetch
   *  refetches — for invalidation and test isolation. Drops the persisted
   *  row too, or the cold tier would just hand the value straight back. */
  delete(key: string): void {
    this.entries.delete(key)
    this.inflight.delete(key)
    const persistence = this.persistence
    if (persistence) {
      this.dropping.add(key)
      void persistence.store
        .delete(key)
        .catch(() => {})
        .finally(() => this.dropping.delete(key))
    }
    refreshCounts()
  }

  async getOrFetch<T>(
    key: string,
    ttl: number,
    fetcher: () => Promise<T>,
    opts: { prefetch?: boolean } = {},
  ): Promise<T> {
    const scoped = `${this.name}:${key}`
    const existing = this.entries.get(key)
    if (existing && existing.expiresAt > Date.now()) {
      // LRU touch: re-insert as newest.
      this.entries.delete(key)
      this.entries.set(key, existing)
      cacheStats.hits++
      record('hit', scoped)
      return existing.value as T
    }

    const pending = this.inflight.get(key)
    if (pending) {
      cacheStats.joins++
      record('join', scoped)
      return pending as Promise<T>
    }

    // Only immutable entries are eligible for the cold tier — see
    // CachePersistence.
    const persistence = ttl === TTL.FOREVER ? this.persistence : null

    /**
     * Disk before network. Counting happens here rather than up front so
     * the diagnostics stay truthful: a disk hit is not a miss, and no
     * request was made. Concurrent callers still join, because this whole
     * function is what the in-flight promise wraps.
     */
    const produce = async (): Promise<T> => {
      if (persistence && !this.dropping.has(key)) {
        const stored = await persistence.store.get(key)
        if (stored !== undefined) {
          cacheStats.diskHits++
          record('disk', scoped)
          return stored as T
        }
      }
      if (opts.prefetch) {
        cacheStats.prefetches++
        record('prefetch', scoped)
      } else {
        cacheStats.misses++
        record('miss', scoped)
      }
      const value = await fetcher()
      if (persistence) {
        // Best-effort and off the critical path: the value is already
        // being returned, and a storage failure must never fail a request.
        void persistence.store
          .put(key, value, persistence.bytesOf(value))
          .then((stored) => {
            // Only a value actually on disk counts: a dropped write
            // (quota, blocked storage) resolves false, and a counter that
            // tallied attempts would report a warm cache that isn't.
            if (stored) cacheStats.diskWrites++
          })
          .catch(() => {})
      }
      return value
    }

    const p = produce()
      .then((value) => {
        this.entries.delete(key)
        this.entries.set(key, {
          value,
          expiresAt: ttl === TTL.FOREVER ? Number.POSITIVE_INFINITY : Date.now() + ttl,
        })
        while (this.entries.size > this.maxEntries) {
          const oldest = this.entries.keys().next().value as string
          this.entries.delete(oldest)
          cacheStats.evictions++
          record('evict', `${this.name}:${oldest}`)
        }
        refreshCounts()
        return value
      })
      .finally(() => {
        this.inflight.delete(key)
        refreshCounts()
      })

    this.inflight.set(key, p)
    refreshCounts()
    return p
  }
}

/** Phase 1 REST responses (normalized record arrays). */
export const stationCache = new DataCache('station')
/** Decoded model/wave grids — capped so resident memory stays sane (~40 × ≤2.3MB). */
export const gridCache = new DataCache('grid', 40)
/** Manifests, NOAA timeline, wave-bucket availability. */
export const miscCache = new DataCache('misc')
