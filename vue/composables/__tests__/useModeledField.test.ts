import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { buildNpy } from '../../core/__tests__/buildNpy'
import { gridCache, miscCache } from '../../core/cache'
import { gridKey, parseFrameName, type ModelFrame } from '../../data/modeledGrid'
import { resetModelTimeForTests, useModelTime } from '../useModelTime'
import { useModeledField } from '../useModeledField'

/** Distinct filenames per test file so the module-level gridCache never
 *  collides (same pattern as modeledGrid.test.ts). */
const NAMES = [
  '1993-05-01 00.npy',
  '1993-05-01 02.npy',
  '1993-05-01 04.npy',
  '1993-05-01 06.npy',
]

const fetchMock = vi.fn()

function frame(name: string): ModelFrame {
  const f = parseFrameName(name)
  if (!f) throw new Error('bad fixture name')
  return f
}

beforeEach(() => {
  // Fake timers keep the composable's 350 ms settle-prefetch from firing
  // after teardown (when fetch is no longer stubbed) — pending fake timers
  // are discarded by useRealTimers, and tests advance time deliberately.
  vi.useFakeTimers()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  miscCache.delete('model-manifest')
  for (const n of NAMES) {
    gridCache.delete(gridKey('temperature', frame(n)))
    gridCache.delete(gridKey('flow', frame(n)))
  }
  resetModelTimeForTests()
})
afterEach(() => {
  resetModelTimeForTests()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function manifestResponse() {
  return { ok: true, json: async () => ({ temperature: NAMES, flow: NAMES }) }
}
function npyResponse() {
  return { ok: true, arrayBuffer: async () => buildNpy([1, 2], [10, 20]) }
}

/** Flush promises + watchers without crossing the 350 ms settle timer. */
const settle = () => vi.advanceTimersByTimeAsync(10)

const gridFetches = () =>
  fetchMock.mock.calls.filter((c) => (c[0] as string).includes('/temperature/')).length

describe('useModeledField', () => {
  it('loads the selected frame and serves revisited hours from cache', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('contents.json') ? manifestResponse() : npyResponse(),
    )
    const scope = effectScope()
    const field = scope.run(() => useModeledField('temperature'))!
    await settle()
    field.selectedIndex.value = 0
    await settle()
    expect(field.state.value.status).toBe('success')
    const before = gridFetches()
    field.stepHour(1) // miss -> one new fetch
    await settle()
    expect(gridFetches()).toBe(before + 1)
    field.stepHour(-1) // revisit -> synchronous cache hit
    await settle()
    expect(field.state.value.status).toBe('success')
    expect(field.state.value.fromCache).toBe(true)
    scope.stop()
  })

  it('discards a stale response when the selection moved on (race guard)', async () => {
    let releaseFirst: (() => void) | null = null
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('contents.json')) return manifestResponse()
      if (!releaseFirst) {
        // First grid request hangs until released — a slow frame.
        return new Promise((resolve) => {
          releaseFirst = () => resolve(npyResponse())
        })
      }
      return npyResponse()
    })
    const scope = effectScope()
    const field = scope.run(() => useModeledField('temperature'))!
    await settle()
    field.selectedIndex.value = 0 // slow request starts
    await settle()
    field.selectedIndex.value = 2 // user moved on
    await settle()
    expect(field.state.value.status).toBe('success')
    const winner = field.state.value
    releaseFirst!() // stale response lands late
    await settle()
    expect(field.state.value).toBe(winner)
    scope.stop()
  })

  it('prefetches the whole playback window when playback starts', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('contents.json') ? manifestResponse() : npyResponse(),
    )
    const scope = effectScope()
    const field = scope.run(() => useModeledField('temperature'))!
    await settle()
    field.selectedIndex.value = 0
    await settle()
    const time = useModelTime()
    // Arm playback state directly; the composable watches `playing`.
    time.playTargetIndex.value = 3
    time.playing.value = true
    await settle()
    const urls = fetchMock.mock.calls
      .map((c) => decodeURIComponent(c[0] as string))
      .filter((u) => u.includes('/temperature/'))
    for (const n of NAMES.slice(1)) {
      expect(urls.some((u) => u.includes(n))).toBe(true)
    }
    scope.stop()
  })

  it('a disposed scope cancels the pending settle prefetch (no post-unmount requests)', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('contents.json') ? manifestResponse() : npyResponse(),
    )
    const scope = effectScope()
    const field = scope.run(() => useModeledField('temperature'))!
    await settle()
    field.selectedIndex.value = 1
    await settle()
    const before = gridFetches()
    scope.stop() // unmount before the 350 ms settle threshold
    await vi.advanceTimersByTimeAsync(400)
    expect(gridFetches()).toBe(before)
  })

  it('prefetches adjacent frames after the view settles for 350 ms', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('contents.json') ? manifestResponse() : npyResponse(),
    )
    const scope = effectScope()
    const field = scope.run(() => useModeledField('temperature'))!
    await settle()
    field.selectedIndex.value = 1
    await settle()
    const before = gridFetches()
    await vi.advanceTimersByTimeAsync(400) // cross the settle threshold
    // Neighbors 0 and 2 fetched in the background; frame 3 is already
    // cached (the default closest-to-now selection landed there on mount)
    // and frame 1 is the current one.
    expect(gridFetches()).toBe(before + 2)
    scope.stop()
  })
})
