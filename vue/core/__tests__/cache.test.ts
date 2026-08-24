import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataCache, TTL } from '../cache'

const value = (v: string) => async () => v

afterEach(() => {
  vi.useRealTimers()
})

describe('DataCache LRU ordering (PR review findings)', () => {
  it('peek refreshes recency so peek-only entries are not evicted first', async () => {
    const cache = new DataCache('test-peek', 2)
    await cache.getOrFetch('a', TTL.FOREVER, value('A'))
    await cache.getOrFetch('b', TTL.FOREVER, value('B'))
    // 'a' is oldest; a peek should promote it above 'b'.
    expect(cache.peek('a')).toBe('A')
    await cache.getOrFetch('c', TTL.FOREVER, value('C'))
    // Cap is 2: 'b' (now oldest) was evicted, peeked 'a' survived.
    expect(cache.peek('a')).toBe('A')
    expect(cache.peek('b')).toBeUndefined()
    expect(cache.peek('c')).toBe('C')
  })

  it('refreshing an expired entry moves it to newest position', async () => {
    vi.useFakeTimers()
    const cache = new DataCache('test-expiry', 2)
    await cache.getOrFetch('a', 1_000, value('A1'))
    await cache.getOrFetch('b', TTL.FOREVER, value('B'))
    // Expire 'a', then refetch it — the refreshed entry must rank newest,
    // not inherit the stale oldest slot.
    vi.advanceTimersByTime(2_000)
    await cache.getOrFetch('a', TTL.FOREVER, value('A2'))
    await cache.getOrFetch('c', TTL.FOREVER, value('C'))
    // 'b' (oldest) evicted; refreshed 'a' survived.
    expect(cache.peek('a')).toBe('A2')
    expect(cache.peek('b')).toBeUndefined()
    expect(cache.peek('c')).toBe('C')
  })

  it('joins concurrent requests for the same key into one fetch', async () => {
    const cache = new DataCache('test-join')
    let calls = 0
    const slow = () => {
      calls++
      return new Promise<string>((r) => setTimeout(() => r('V'), 10))
    }
    const [x, y] = await Promise.all([
      cache.getOrFetch('k', TTL.FOREVER, slow),
      cache.getOrFetch('k', TTL.FOREVER, slow),
    ])
    expect(x).toBe('V')
    expect(y).toBe('V')
    expect(calls).toBe(1)
  })
})
