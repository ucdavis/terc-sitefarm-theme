import { reactive } from 'vue'

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
  kind: 'hit' | 'miss' | 'join' | 'evict' | 'prefetch'
  key: string
  at: number
}

export const cacheStats = reactive({
  hits: 0,
  misses: 0,
  joins: 0,
  evictions: 0,
  prefetches: 0,
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

export class DataCache {
  // Map preserves insertion order -> oldest-first makes a cheap LRU.
  private entries = new Map<string, Entry>()
  private inflight = new Map<string, Promise<unknown>>()

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
   *  used by views to render instantly (no loading flash) on revisit. */
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

    if (opts.prefetch) {
      cacheStats.prefetches++
      record('prefetch', scoped)
    } else {
      cacheStats.misses++
      record('miss', scoped)
    }

    const p = fetcher()
      .then((value) => {
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
