// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { NearshoreRecord } from '../../data/stationData'

const nearshore = vi.fn()
const buoy = vi.fn()
const homewood = vi.fn()
const metStation = vi.fn()

const storedMet = vi.fn()

vi.mock('../../data/stationData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/stationData')>()
  return {
    ...actual,
    fetchNearshoreRange: (...args: unknown[]) => nearshore(...args),
    fetchNasaBuoy: (...args: unknown[]) => buoy(...args),
    fetchHomewood: (...args: unknown[]) => homewood(...args),
    fetchMetStation: (...args: unknown[]) => metStation(...args),
    readStoredMet: () => storedMet(),
    readStoredNearshore: async () => undefined,
    peekNearshoreRange: () => undefined,
  }
})
// The overview seeds live markers (used for the "reporting destinations"
// hint); keep it inert here.
vi.mock('../../composables/useLakeOverview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../composables/useLakeOverview')>()
  const { ref } = await import('vue')
  return { ...actual, useLakeOverview: () => ({ markers: ref([]), reload: () => {} }) }
})

import PlanYourDayView from '../PlanYourDayView.vue'
import {
  resetRegistryForTests,
  syncFromLocation,
  useConditionsState,
} from '../../composables/useConditionsState'
import { COLD_WATER_SHOCK_NOTE } from '../../config/qualitative'

function rec(over: Partial<NearshoreRecord> = {}): NearshoreRecord {
  return {
    time: new Date('2026-08-30T18:00:00Z'),
    waterTemp: 65,
    waveHeight: 0.3,
    turbidity: 0.8,
    conductivity: 0.09,
    dissolvedOxygen: 95,
    chlorophyll: 1.2,
    ...over,
  }
}
const series = (stationId: number, name: string | null, records: NearshoreRecord[]) => ({
  stationId,
  stationName: name,
  records,
})

beforeEach(() => {
  window.history.replaceState(null, '', '/lake-conditions')
  resetRegistryForTests()
  syncFromLocation()
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
  nearshore.mockReset().mockImplementation((id: number) => Promise.resolve(series(id, null, [])))
  buoy.mockReset().mockResolvedValue([])
  homewood.mockReset().mockResolvedValue(series(-1, null, []))
  metStation.mockReset().mockResolvedValue([])
  storedMet.mockReset().mockResolvedValue(undefined)
})

const cardLabels = (w: ReturnType<typeof mount>) =>
  w.findAll('.pyd-grid')[0].findAll('.card-label').map((n) => n.text())

describe('PlanYourDayView', () => {
  it('always shows the cold-water-shock note; the whole-lake welcome now lives beside the map', () => {
    const w = mount(PlanYourDayView)
    expect(w.find('.pyd-cold-note').text()).toBe(COLD_WATER_SHOCK_NOTE)
    // The welcome moved to the shell's map aside (TERC-9 follow-up).
    expect(w.text()).not.toContain('Welcome to Lake Tahoe')
    expect(w.find('.pyd-welcome').exists()).toBe(false)
  })

  it('defaults each station card set to temp, wave height, and turbidity (demo decision)', async () => {
    nearshore.mockImplementation((id: number) =>
      Promise.resolve(id === 4 ? series(4, null, [rec()]) : series(id, null, [])),
    )
    const { selectDestination } = useConditionsState()
    selectDestination('homewood')
    const w = mount(PlanYourDayView)
    await flushPromises()
    expect(w.text()).toContain('Homewood')
    expect(cardLabels(w)).toEqual(['Water temperature', 'Wave height', 'Turbidity'])
    // Bands render on the cards
    expect(w.text()).toContain('Cool')
    expect(w.text()).toContain('Calm')
  })

  it('"show more data" reveals the remaining metrics, exposes state, and persists', async () => {
    nearshore.mockImplementation((id: number) =>
      Promise.resolve(id === 4 ? series(4, null, [rec()]) : series(id, null, [])),
    )
    const { selectDestination } = useConditionsState()
    selectDestination('homewood')
    const w = mount(PlanYourDayView)
    await flushPromises()

    const toggle = w.find('.pyd-toggle')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(cardLabels(w)).toEqual([
      'Water temperature',
      'Wave height',
      'Turbidity',
      'Conductivity',
      'Dissolved oxygen',
      'Chlorophyll',
    ])
    expect(localStorage.getItem('terc-pyd-show-more')).toBe('1')

    // A fresh mount restores the visitor's choice.
    const w2 = mount(PlanYourDayView)
    await flushPromises()
    expect(w2.find('.pyd-toggle').attributes('aria-expanded')).toBe('true')
  })

  it('shows a focused buoy its three metrics, with the sensor note only when expanded', async () => {
    buoy.mockImplementation((id: number) =>
      Promise.resolve(id === 2 ? [{ time: new Date(), waterTemp: 67, airTemp: 71, windSpeed: 4 }] : []),
    )
    const { focusStation } = useConditionsState()
    focusStation({ kind: 'buoy', sourceId: 2, name: 'NASA Buoy TB2' })
    const w = mount(PlanYourDayView)
    await flushPromises()
    expect(cardLabels(w)).toEqual(['Water temperature', 'Air temperature', 'Wind'])
    expect(w.text()).not.toContain("don't carry")
    await w.find('.pyd-toggle').trigger('click')
    expect(w.text()).toContain("don't carry turbidity")
  })

  it('reports an all-quiet destination honestly, listing station statuses', async () => {
    const { selectDestination } = useConditionsState()
    selectDestination('homewood') // stations 4, 5 + tc-homewood, all empty
    const w = mount(PlanYourDayView)
    await flushPromises()
    expect(w.text()).toContain('No station data available for Homewood')
    expect(w.text()).toContain('no data available')
    expect(w.text()).toContain('Homewood TC')
  })

  it('flags implausible dissolved oxygen as suspect instead of interpreting it', async () => {
    nearshore.mockImplementation((id: number) =>
      Promise.resolve(id === 4 ? series(4, null, [rec({ dissolvedOxygen: 250 })]) : series(id, null, [])),
    )
    const { selectDestination } = useConditionsState()
    selectDestination('homewood')
    const w = mount(PlanYourDayView)
    await flushPromises()
    await w.find('.pyd-toggle').trigger('click')
    const icon = w.find('.suspect')
    expect(icon.exists()).toBe(true)
    // Decorative: the note text below carries the message for AT.
    expect(icon.attributes('aria-hidden')).toBe('true')
    expect(w.text()).toContain('possible sensor issue')
    expect(w.text()).not.toContain('Supersaturated')
  })

  it('reloads station data when the registry is replaced, so names follow editor renames', async () => {
    // incline-village exists in BOTH the static registry and the site
    // fixture, so the selection survives the registry swap.
    const { selectDestination } = useConditionsState()
    selectDestination('incline-village')
    const w = mount(PlanYourDayView)
    await flushPromises()
    const callsBefore = nearshore.mock.calls.length
    expect(callsBefore).toBeGreaterThan(0)

    // Site registry arrives (fixture captured from tercdev) -> the data
    // composable reloads, re-deriving slot/buoy display names from the new
    // registry (near-free in production: the refetch hits the shared cache).
    const fixture = await import('../../data/__tests__/lake-locations.fixture.json')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fixture.default ?? fixture }))
    const { loadRegistry } = await import('../../composables/useConditionsState')
    await loadRegistry()
    await flushPromises()
    expect(nearshore.mock.calls.length).toBeGreaterThan(callsBefore)
    vi.unstubAllGlobals()
    w.unmount()
  })

  it('shows lake weather from the met station, flagged when the request fails, with a retry', async () => {
    metStation.mockResolvedValue([
      { time: new Date(), airTemp: 75, waterTemp: null, windSpeed: 6, windGust: null, windDir: null, humidity: null, pressure: null },
    ])
    const w = mount(PlanYourDayView)
    await flushPromises()
    expect(w.text()).toContain('Lake weather')
    expect(w.text()).toContain('75.0')

    metStation.mockRejectedValue(new Error('boom'))
    const w2 = mount(PlanYourDayView)
    await flushPromises()
    expect(w2.get('.pyd-met-state').attributes('role')).toBe('status')
    expect(w2.text()).toContain('Lake weather is temporarily unavailable')
    expect(w2.find('.skeleton').exists()).toBe(false)

    // Retry re-asks and recovers.
    metStation.mockResolvedValue([
      { time: new Date(), airTemp: 61, waterTemp: null, windSpeed: 2, windGust: null, windDir: null, humidity: null, pressure: null },
    ])
    await w2.get('.pyd-retry').trigger('click')
    await flushPromises()
    expect(w2.text()).toContain('61.0')
    expect(w2.find('.pyd-retry').exists()).toBe(false)
  })

  it('an empty recent window is "no data", dated by the last reading it can find — never an endless skeleton', async () => {
    // Last 24 h: nothing. 30-day lookback: the station\'s last reading.
    const lastSeen = new Date('2026-09-02T19:40:00Z') // 12:40 lake time (PDT)
    metStation.mockImplementation((start: Date, end: Date) =>
      Promise.resolve(
        end.getTime() - start.getTime() > 2 * 86_400_000
          ? [{ time: lastSeen, airTemp: 70, waterTemp: null, windSpeed: 3, windGust: null, windDir: null, humidity: null, pressure: null }]
          : [],
      ),
    )
    const w = mount(PlanYourDayView)
    await flushPromises()
    expect(w.find('.skeleton').exists()).toBe(false)
    expect(w.text()).toContain('No lake weather in the last 24 hours')
    expect(w.text()).toContain('last reported Sep 2, 12:40 PM lake time')
    expect(w.find('.pyd-retry').exists()).toBe(false) // empty is not an error

    metStation.mockResolvedValue([])
    const w2 = mount(PlanYourDayView)
    await flushPromises()
    expect(w2.text()).toContain('No lake weather from the USCG met station in the last 30 days')
  })

  it('a hung request resolves to a timeout message with a retry instead of loading forever', async () => {
    vi.useFakeTimers()
    metStation.mockImplementation(() => new Promise(() => {}))
    const w = mount(PlanYourDayView)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(w.text()).toContain('taking too long to load')
    expect(w.text()).toContain('20 seconds')
    expect(w.find('.pyd-retry').exists()).toBe(true)
    vi.useRealTimers()
  })

  describe('last-known lake weather (TERC-70)', () => {
    const remembered = { time: new Date('2026-09-11T20:40:00Z'), airTemp: 66, waterTemp: null, windSpeed: 4, windGust: null, windDir: null, humidity: null, pressure: null }

    it('paints the remembered reading while the live request is queued, then the live one replaces it with a Checked stamp', async () => {
      storedMet.mockResolvedValue({ value: [remembered], storedAt: Date.parse('2026-09-11T21:00:00Z') })
      let release!: (v: unknown) => void
      metStation.mockImplementation(() => new Promise((r) => (release = r)))
      const w = mount(PlanYourDayView)
      await flushPromises()
      expect(w.text()).toContain('66.0')
      expect(w.get('.pyd-freshness').text()).toContain('Showing the reading fetched Sep 11, 2:00 PM lake time · updating…')
      release([{ ...remembered, airTemp: 68 }])
      await flushPromises()
      expect(w.text()).toContain('68.0')
      expect(w.get('.pyd-freshness').text()).toMatch(/^Checked .* lake time$/)
      expect(w.find('.pyd-retry').exists()).toBe(false)
      // Lake weather is what the visitor is looking at: it asks first.
      expect((metStation.mock.calls[0] as unknown[])[2]).toEqual({ priority: 'high' })
    })

    it('keeps the remembered reading on screen when the live request fails, saying so, with a retry', async () => {
      storedMet.mockResolvedValue({ value: [remembered], storedAt: Date.parse('2026-09-11T21:00:00Z') })
      metStation.mockRejectedValue(new Error('boom'))
      const w = mount(PlanYourDayView)
      await flushPromises()
      expect(w.text()).toContain('66.0')
      const line = w.get('.pyd-freshness')
      expect(line.text()).toContain('the met station request failed')
      expect(line.classes()).toContain('pyd-freshness--stale')
      expect(w.find('.pyd-met-state').exists()).toBe(false) // no separate error box
      metStation.mockResolvedValue([{ ...remembered, airTemp: 70 }])
      await w.get('.pyd-retry').trigger('click')
      await flushPromises()
      expect(w.text()).toContain('70.0')
    })

    it('with nothing remembered, behaves exactly as before', async () => {
      metStation.mockRejectedValue(new Error('boom'))
      const w = mount(PlanYourDayView)
      await flushPromises()
      expect(w.text()).toContain('Lake weather is temporarily unavailable')
      expect(w.find('.pyd-freshness').exists()).toBe(false)
    })
  })
})
