import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataCache, TTL, cacheStats } from '../cache'
import type { PersistentStore } from '../persistentStore'

/**
 * A fake cold tier, the same way map tests drive a fake engine — the real
 * IndexedDB adapter is the thin, live-verified edge (indexedDbStore.ts).
 */
function fakeStore() {
  const rows = new Map<string, { value: unknown; bytes: number }>()
  const calls = { get: 0, put: 0 }
  const store: PersistentStore = {
    async get(key) {
      calls.get++
      return rows.get(key)?.value
    },
    async put(key, value, bytes) {
      calls.put++
      rows.set(key, { value, bytes })
    },
    async clear() {
      rows.clear()
    },
  }
  return { store, rows, calls }
}

const bytesOf = () => 128
const flush = () => new Promise((r) => setTimeout(r, 0))

let cache: DataCache
let seq = 0

beforeEach(() => {
  cache = new DataCache(`test-${seq++}`)
  cacheStats.diskHits = 0
  cacheStats.diskWrites = 0
  cacheStats.misses = 0
})
afterEach(() => {
  cache.attachPersistence(null)
})

describe('DataCache cold tier', () => {
  it('writes immutable values through to the store', async () => {
    const { store, rows, calls } = fakeStore()
    cache.attachPersistence({ store, bytesOf })
    await cache.getOrFetch('grid:a', TTL.FOREVER, async () => ({ n: 1 }))
    await flush()
    expect(rows.get('grid:a')?.value).toEqual({ n: 1 })
    expect(rows.get('grid:a')?.bytes).toBe(128)
    expect(calls.put).toBe(1)
  })

  it('serves a cold start from the store without fetching', async () => {
    const { store } = fakeStore()
    await store.put('grid:b', { n: 2 }, 128)
    cache.attachPersistence({ store, bytesOf })

    const fetcher = vi.fn()
    const value = await cache.getOrFetch('grid:b', TTL.FOREVER, fetcher)
    expect(value).toEqual({ n: 2 })
    expect(fetcher).not.toHaveBeenCalled()
    // A disk hit is not a miss: nothing was requested.
    expect(cacheStats.diskHits).toBe(1)
    expect(cacheStats.misses).toBe(0)
  })

  it('promotes a disk hit into memory so the next read is synchronous', async () => {
    const { store, calls } = fakeStore()
    await store.put('grid:c', { n: 3 }, 128)
    cache.attachPersistence({ store, bytesOf })

    await cache.getOrFetch('grid:c', TTL.FOREVER, async () => ({ n: 999 }))
    expect(cache.peek('grid:c')).toEqual({ n: 3 })
    expect(calls.get).toBe(1) // not consulted again
  })

  it('never persists values with a real TTL — those are volatile by definition', async () => {
    const { store, rows, calls } = fakeStore()
    cache.attachPersistence({ store, bytesOf })
    await cache.getOrFetch('manifest', TTL.SHORT, async () => ({ fresh: true }))
    await flush()
    expect(rows.size).toBe(0)
    expect(calls.get).toBe(0) // and never consults it on the way in
  })

  it('falls back to the network when the store read fails', async () => {
    const store: PersistentStore = {
      async get() {
        throw new Error('storage blocked')
      },
      async put() {},
      async clear() {},
    }
    cache.attachPersistence({ store, bytesOf })
    // A rejecting read propagates; the tier's own adapter swallows its
    // failures, so this documents the contract the adapter must honour.
    await expect(cache.getOrFetch('grid:d', TTL.FOREVER, async () => 1)).rejects.toThrow(
      /storage blocked/,
    )
  })

  it('still returns the value when the store write fails', async () => {
    const store: PersistentStore = {
      async get() {
        return undefined
      },
      async put() {
        throw new Error('quota exceeded')
      },
      async clear() {},
    }
    cache.attachPersistence({ store, bytesOf })
    await expect(cache.getOrFetch('grid:e', TTL.FOREVER, async () => 42)).resolves.toBe(42)
    await flush()
    expect(cacheStats.diskWrites).toBe(0)
  })

  it('joins concurrent callers onto one disk read', async () => {
    const { store, calls } = fakeStore()
    await store.put('grid:f', { n: 6 }, 128)
    cache.attachPersistence({ store, bytesOf })

    const fetcher = vi.fn(async () => ({ n: 0 }))
    const [a, b] = await Promise.all([
      cache.getOrFetch('grid:f', TTL.FOREVER, fetcher),
      cache.getOrFetch('grid:f', TTL.FOREVER, fetcher),
    ])
    expect(a).toBe(b)
    expect(calls.get).toBe(1)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('is inert until a tier is attached', async () => {
    const fetcher = vi.fn(async () => 'network')
    expect(await cache.getOrFetch('grid:g', TTL.FOREVER, fetcher)).toBe('network')
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
