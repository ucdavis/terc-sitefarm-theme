import { describe, expect, it, vi } from 'vitest'
import { loadWithLastKnown } from '../lastKnown'
import { loading, type RequestState } from '../requestState'
import type { StoredRow } from '../cache'

/**
 * The point of this helper is that the OUTCOME NEVER DEPENDS ON WHICH
 * PROMISE SETTLES FIRST (Copilot, PR #39): a fast failure must not discard
 * the remembered reading, and a fast remembered reading must not swallow
 * the failure.
 */
type Rows = { n: number }[]
const row = (v: Rows): StoredRow<Rows> => ({ value: v, storedAt: 1_700_000_000_000 })
const remembered: Rows = [{ n: 1 }]
const fresh: Rows = [{ n: 2 }]

function collect() {
  const states: RequestState<Rows>[] = [loading()]
  return { states, set: (s: RequestState<Rows>) => states.push(s), last: () => states[states.length - 1] }
}
const hasData = (r: Rows) => r.length > 0

describe('loadWithLastKnown', () => {
  it('paints the remembered reading, then replaces it with the live one', async () => {
    const c = collect()
    let release!: (v: Rows) => void
    await Promise.all([
      loadWithLastKnown({ stored: Promise.resolve(row(remembered)), live: new Promise<Rows>((r) => (release = r)), hasData, set: c.set }),
      (async () => {
        await Promise.resolve()
        await Promise.resolve()
        expect(c.last()).toEqual({ status: 'success', data: remembered, error: null, fromCache: true })
        release(fresh)
      })(),
    ])
    expect(c.last()).toEqual({ status: 'success', data: fresh, error: null, fromCache: false })
  })

  it('keeps the remembered reading AND reports the error when the live request fails first', async () => {
    const c = collect()
    // The disk read resolves on a later tick than the immediate rejection.
    const stored = new Promise<StoredRow<Rows>>((r) => setTimeout(() => r(row(remembered)), 5))
    await loadWithLastKnown({ stored, live: Promise.reject(new Error('offline')), hasData, set: c.set })
    expect(c.last()).toEqual({ status: 'success', data: remembered, error: 'offline', fromCache: true })
  })

  it('keeps the remembered reading AND reports the error when the disk read wins', async () => {
    const c = collect()
    const live = new Promise<Rows>((_, rej) => setTimeout(() => rej(new Error('boom')), 5))
    await loadWithLastKnown({ stored: Promise.resolve(row(remembered)), live, hasData, set: c.set })
    expect(c.states.map((s) => [s.status, s.error])).toEqual([
      ['loading', null],
      ['success', null], // remembered, painted early
      ['success', 'boom'], // same reading, now saying why it is old
    ])
    expect(c.last().data).toEqual(remembered)
  })

  it('is an ordinary failure when nothing was remembered', async () => {
    const c = collect()
    await loadWithLastKnown({ stored: Promise.resolve(undefined), live: Promise.reject(new Error('nope')), hasData, set: c.set })
    expect(c.last()).toEqual({ status: 'error', data: null, error: 'nope', fromCache: false })
  })

  it('treats an empty remembered row as nothing remembered', async () => {
    const c = collect()
    await loadWithLastKnown({ stored: Promise.resolve(row([])), live: Promise.reject(new Error('nope')), hasData, set: c.set })
    expect(c.last().status).toBe('error')
  })

  it('reports an empty live answer as empty, not as the remembered reading', async () => {
    const c = collect()
    await loadWithLastKnown({ stored: Promise.resolve(row(remembered)), live: Promise.resolve([]), hasData, set: c.set })
    expect(c.last().status).toBe('empty')
  })

  it('survives a failing disk read', async () => {
    const c = collect()
    await loadWithLastKnown({ stored: Promise.reject(new Error('indexeddb blocked')), live: Promise.resolve(fresh), hasData, set: c.set })
    expect(c.last().data).toEqual(fresh)
  })

  it('commits nothing once a newer load has superseded it', async () => {
    const c = collect()
    await loadWithLastKnown({ stored: Promise.resolve(row(remembered)), live: Promise.reject(new Error('x')), hasData, set: c.set, current: () => false })
    expect(c.states).toHaveLength(1) // still just the initial loading state
  })
})
