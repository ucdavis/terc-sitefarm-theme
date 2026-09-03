// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { NearshoreRecord } from '../../data/stationData'

const nearshore = vi.fn()
const buoy = vi.fn()
const homewood = vi.fn()
const metStation = vi.fn()

vi.mock('../../data/stationData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/stationData')>()
  return {
    ...actual,
    fetchNearshoreRange: (...args: unknown[]) => nearshore(...args),
    fetchNasaBuoy: (...args: unknown[]) => buoy(...args),
    fetchHomewood: (...args: unknown[]) => homewood(...args),
    fetchMetStation: (...args: unknown[]) => metStation(...args),
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

  it('shows lake weather from the met station, flagged when the request fails', async () => {
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
    expect(w2.text()).toContain('Lake weather is temporarily unavailable')
  })
})
