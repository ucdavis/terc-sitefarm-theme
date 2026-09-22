// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { gridCache, miscCache, TTL } from '../../core/cache'
import { resetWaveTimeForTests } from '../useWaveTime'
import { resetWaveResolutionForTests } from '../../data/waveHeight'
import { useWaveField } from '../useWaveField'

const fetchMock = vi.fn()
const flush = () => new Promise((r) => setTimeout(r, 0))

/**
 * NOAA's forecast covers two hours; since TERC-93 those ARE the wave view's
 * frames (useWaveTime), in time order:
 *   0  2026-09-02 13 lake (20:00Z) — 18 km/h from 240° -> bucket ws5/wd240
 *   1  2026-09-02 14 lake (21:00Z) — 36 km/h from 90°  -> bucket ws10/wd90
 * Frame 1 deliberately resolves to a DIFFERENT bucket so stepping to it
 * exercises the uncached load path.
 */
const FIRST = 0
const OTHER_BUCKET = 1

const WIND_BODY = {
  ok: true,
  json: async () => ({
    properties: {
      windSpeed: {
        uom: 'wmoUnit:km_h-1',
        values: [
          { validTime: '2026-09-02T20:00:00+00:00/PT1H', value: 18 },
          { validTime: '2026-09-02T21:00:00+00:00/PT1H', value: 36 },
        ],
      },
      windDirection: {
        uom: 'wmoUnit:degree_(angle)',
        values: [
          { validTime: '2026-09-02T20:00:00+00:00/PT1H', value: 240 },
          { validTime: '2026-09-02T21:00:00+00:00/PT1H', value: 90 },
        ],
      },
    },
  }),
}

const waveBody = (nested: (number | null)[][]) => ({
  ok: true,
  arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(nested)).buffer,
})

/** Route by URL so request ordering doesn't matter. The model's manifest is
 *  deliberately NOT routed: the wave view must never need it (TERC-93). */
function route(over: { wind?: unknown; wave?: () => unknown } = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('weather.gov')) return over.wind ?? WIND_BODY
    if (url.includes('waveheight')) return over.wave ? over.wave() : waveBody([[0.3, 0.5]])
    throw new Error(`unexpected fetch: ${url}`)
  })
}

const windCalls = () =>
  fetchMock.mock.calls.filter((c) => String(c[0]).includes('weather.gov')).length

async function settle() {
  await flush()
  await flush()
  await nextTick()
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  miscCache.delete('noaa-wind')
  // The grid cache is module-level: without this, a bucket loaded by an
  // earlier test makes a later one take the cache-first path it wasn't
  // trying to exercise.
  gridCache.delete('wave:5:240')
  gridCache.delete('wave:10:90')
  resetWaveTimeForTests()
  resetWaveResolutionForTests()
})
afterEach(() => {
  resetWaveTimeForTests()
  miscCache.delete('noaa-wind')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Start the composable, let NOAA's hours load, and choose a frame. */
async function mountField(index: number) {
  const scope = effectScope()
  let field!: ReturnType<typeof useWaveField>
  scope.run(() => {
    field = useWaveField()
  })
  await settle()
  field.selectedIndex.value = index
  await settle()
  return { field, scope }
}

/** Change the selected frame and let the load settle. */
async function select(field: ReturnType<typeof useWaveField>, index: number) {
  field.selectedIndex.value = index
  await settle()
}

describe('useWaveField', () => {
  it('offers NOAA’s forecast hours, with no dependence on TERC’s model', async () => {
    route() // an unrouted contents.json request would throw
    const { field, scope } = await mountField(FIRST)
    expect(field.frames.value.map((f) => [f.date, f.hour])).toEqual([
      ['2026-09-02', 13],
      ['2026-09-02', 14],
    ])
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('contents.json'))).toBe(false)
    scope.stop()
  })

  it('resolves the hour to a wind bucket and loads that grid', async () => {
    route()
    const { field, scope } = await mountField(FIRST)
    expect(field.wind.value?.speedMs).toBeCloseTo(5) // 18 km/h
    expect(field.bucket.value).toEqual({ ws: 5, wd: 240 })
    expect(field.state.value.status).toBe('success')

    await select(field, OTHER_BUCKET)
    expect(field.wind.value?.dirDeg).toBe(90)
    expect(field.bucket.value).toEqual({ ws: 10, wd: 90 })
    scope.stop()
  })

  it('refreshes NOAA’s hours while open, so a kiosk never serves a stale forecast', async () => {
    // Only the interval is faked: the flushes above run on real setTimeout.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    route()
    const { field, scope } = await mountField(FIRST)
    expect(windCalls()).toBe(1)

    miscCache.delete('noaa-wind') // the TTL lapses
    vi.advanceTimersByTime(TTL.SHORT)
    await settle()
    expect(windCalls()).toBe(2)
    expect(field.selectedIndex.value).toBe(FIRST) // the refresh kept the hour

    scope.stop()
    miscCache.delete('noaa-wind')
    vi.advanceTimersByTime(TTL.SHORT * 3)
    await settle()
    expect(windCalls()).toBe(2) // disposal stopped the timer
  })

  it('clears the previous frame’s bucket while a new one loads', async () => {
    // FieldStage renders the chrome during loading, so a stale calm note
    // or substitution caveat must not sit beside the new wind.
    // A holder rather than a bare `let`: TS narrows a closure-assigned
    // variable to `never` at the call site.
    const pending: { release?: () => void } = {}
    route()
    const { field, scope } = await mountField(FIRST)
    expect(field.bucket.value).toEqual({ ws: 5, wd: 240 })
    // The axis opened on the hour closest to now (the last one here), so
    // that bucket is already cached: evict it to force the loading path.
    gridCache.delete('wave:10:90')
    resetWaveResolutionForTests()

    route({
      wave: () => new Promise((resolve) => (pending.release = () => resolve(waveBody([[0.4]])))),
    })
    field.substituted.value = true // pretend the last frame substituted
    field.selectedIndex.value = OTHER_BUCKET // uncached bucket -> loading path
    await flush()

    expect(field.state.value.status).toBe('loading')
    expect(field.bucket.value).toBeNull()
    expect(field.substituted.value).toBe(false)
    pending.release?.()
    scope.stop()
  })

  it('surfaces a wind-forecast failure as an error state, not an empty map', async () => {
    route({ wind: { ok: false, status: 503 } })
    const { field, scope } = await mountField(FIRST)
    expect(field.frames.value).toEqual([])
    expect(field.state.value.status).toBe('error')
    expect(field.windError.value).toMatch(/503/)
    scope.stop()
  })
})
