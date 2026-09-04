// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { gridCache, miscCache } from '../../core/cache'
import { resetModelTimeForTests, useModelTime } from '../useModelTime'
import { resetWaveResolutionForTests } from '../../data/waveHeight'
import { useWaveField } from '../useWaveField'

const fetchMock = vi.fn()
const flush = () => new Promise((r) => setTimeout(r, 0))

/**
 * Three model frames, sorted by time:
 *   0  2026-08-20 13 — long before the wind forecast window
 *   1  2026-09-02 13 (20:00Z) — wind 18 km/h from 240° -> bucket ws5/wd240
 *   2  2026-09-02 14 (21:00Z) — wind 36 km/h from 90°  -> bucket ws10/wd90
 * Frame 2 deliberately resolves to a DIFFERENT bucket so stepping to it
 * exercises the uncached load path.
 */
const MANIFEST = {
  temperature: ['2026-08-20 13.npy', '2026-09-02 13.npy', '2026-09-02 14.npy'],
  flow: [],
}
const OUTSIDE = 0
const COVERED = 1
const OTHER_BUCKET = 2

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

/** Route by URL so request ordering doesn't matter. */
function route(over: { wind?: unknown; wave?: () => unknown } = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('contents.json')) return { ok: true, json: async () => MANIFEST }
    if (url.includes('weather.gov')) return over.wind ?? WIND_BODY
    if (url.includes('waveheight')) return over.wave ? over.wave() : waveBody([[0.3, 0.5]])
    throw new Error(`unexpected fetch: ${url}`)
  })
}

const windCalls = () =>
  fetchMock.mock.calls.filter((c) => String(c[0]).includes('weather.gov')).length

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  miscCache.delete('model-manifest')
  miscCache.delete('noaa-wind')
  // The grid cache is module-level: without this, a bucket loaded by an
  // earlier test makes a later one take the cache-first path it wasn't
  // trying to exercise.
  gridCache.delete('wave:5:240')
  gridCache.delete('wave:10:90')
  resetModelTimeForTests()
  resetWaveResolutionForTests()
})
afterEach(() => {
  resetModelTimeForTests()
  miscCache.delete('noaa-wind')
  vi.unstubAllGlobals()
})

/** Start the composable with the manifest loaded and a frame chosen. */
async function mountField(index: number) {
  const scope = effectScope()
  let field!: ReturnType<typeof useWaveField>
  await useModelTime().ensureManifest()
  scope.run(() => {
    field = useWaveField()
  })
  field.selectedIndex.value = index
  await flush()
  await flush()
  await nextTick()
  return { field, scope }
}

/** Change the selected frame and let the load settle. */
async function select(field: ReturnType<typeof useWaveField>, index: number) {
  field.selectedIndex.value = index
  await flush()
  await flush()
  await nextTick()
}

describe('useWaveField', () => {
  it('resolves the hour to a wind bucket and loads that grid', async () => {
    route()
    const { field, scope } = await mountField(COVERED)
    expect(field.wind.value?.speedMs).toBeCloseTo(5) // 18 km/h
    expect(field.bucket.value).toEqual({ ws: 5, wd: 240 })
    expect(field.state.value.status).toBe('success')
    scope.stop()
  })

  it('re-asks for the wind timeline on every load so a long-open tab stays current', async () => {
    // The call is cached for TTL.SHORT, so this is free inside the window
    // — but a kiosk left open for hours must not keep answering from a
    // timeline whose window has slid out from under the clock.
    route()
    const { field, scope } = await mountField(COVERED)
    expect(windCalls()).toBe(1)

    miscCache.delete('noaa-wind') // the TTL lapses
    await select(field, OTHER_BUCKET)
    expect(windCalls()).toBe(2)
    scope.stop()
  })

  it('clears the previous frame’s bucket while a new one loads', async () => {
    // FieldStage renders the chrome during loading, so a stale calm note
    // or substitution caveat must not sit beside the new wind.
    // A holder rather than a bare `let`: TS narrows a closure-assigned
    // variable to `never` at the call site.
    const pending: { release?: () => void } = {}
    route()
    const { field, scope } = await mountField(COVERED)
    expect(field.bucket.value).toEqual({ ws: 5, wd: 240 })

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

  it('reports an hour outside the wind forecast as empty, not as an error', async () => {
    route()
    const { field, scope } = await mountField(COVERED)
    await select(field, OUTSIDE)
    expect(field.state.value.status).toBe('empty')
    expect(field.wind.value).toBeNull()
    expect(field.bucket.value).toBeNull()
    scope.stop()
  })

  it('surfaces a wind-forecast failure as an error state', async () => {
    route({ wind: { ok: false, status: 503 } })
    const { field, scope } = await mountField(COVERED)
    expect(field.state.value.status).toBe('error')
    expect(field.windError.value).toMatch(/503/)
    scope.stop()
  })
})
