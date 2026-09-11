import { describe, expect, it } from 'vitest'
import { RequestQueue } from '../requestQueue'

/** A task that resolves only when the test says so, recording its start. */
function gate(started: string[], name: string) {
  let release!: () => void
  const done = new Promise<string>((r) => (release = () => r(name)))
  return { run: () => ((started.push(name), done)), release }
}

describe('RequestQueue', () => {
  it('runs at most `limit` tasks at once and starts the rest as slots free up', async () => {
    const q = new RequestQueue(2)
    const started: string[] = []
    const a = gate(started, 'a'), b = gate(started, 'b'), c = gate(started, 'c')
    const pa = q.run('a', 'normal', a.run), pb = q.run('b', 'normal', b.run), pc = q.run('c', 'normal', c.run)
    expect(started).toEqual(['a', 'b'])
    expect(q.activeCount).toBe(2)
    expect(q.waitingCount).toBe(1)
    a.release()
    await pa
    expect(started).toEqual(['a', 'b', 'c'])
    b.release(); c.release()
    await Promise.all([pb, pc])
    expect(q.activeCount).toBe(0)
  })

  it('starts the most urgent waiting task first, oldest among equals', async () => {
    const q = new RequestQueue(1)
    const started: string[] = []
    const first = gate(started, 'first')
    q.run('first', 'normal', first.run)
    const low1 = gate(started, 'low1'), high = gate(started, 'high'), low2 = gate(started, 'low2'), normal = gate(started, 'normal')
    q.run('low1', 'low', low1.run); q.run('high', 'high', high.run); q.run('low2', 'low', low2.run); q.run('normal', 'normal', normal.run)
    first.release(); await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual(['first', 'high'])
    high.release(); await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual(['first', 'high', 'normal'])
    normal.release(); await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual(['first', 'high', 'normal', 'low1'])
    low1.release(); low2.release()
  })

  it('joins a queued key instead of queueing it twice, and raises its priority', async () => {
    const q = new RequestQueue(1)
    const started: string[] = []
    const first = gate(started, 'first')
    q.run('first', 'normal', first.run)
    const badges = gate(started, 'badges'), other = gate(started, 'other')
    const p1 = q.run('station-4', 'low', badges.run)
    q.run('other', 'normal', other.run)
    // The destination view now wants the same station, urgently.
    const p2 = q.run('station-4', 'high', () => Promise.resolve('never runs'))
    expect(p2).toBe(p1)
    expect(q.waitingCount).toBe(2) // not three
    first.release(); await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual(['first', 'badges']) // raised above 'other'
    badges.release(); other.release()
  })

  it('a failing task rejects its callers and frees its slot', async () => {
    const q = new RequestQueue(1)
    const p = q.run('boom', 'normal', () => Promise.reject(new Error('nope')))
    await expect(p).rejects.toThrow('nope')
    const ok = await q.run('ok', 'normal', () => Promise.resolve(1))
    expect(ok).toBe(1)
    expect(q.activeCount).toBe(0)
  })
})
