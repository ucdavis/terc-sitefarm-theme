// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount as vtuMount } from '@vue/test-utils'
import type { NearshoreRecord } from '../../data/stationData'

const nearshore = vi.fn()
const buoy = vi.fn()
const homewood = vi.fn()

vi.mock('../../data/stationData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/stationData')>()
  return {
    ...actual,
    fetchNearshoreRange: (...args: unknown[]) => nearshore(...args),
    fetchNasaBuoy: (...args: unknown[]) => buoy(...args),
    fetchHomewood: (...args: unknown[]) => homewood(...args),
  }
})

import WaterQualityView from '../WaterQualityView.vue'
import { COLD_WATER_SHOCK_NOTE } from '../../config/qualitative'
import {
  resetRegistryForTests,
  syncFromLocation,
  useConditionsState,
} from '../../composables/useConditionsState'

/** Chart.js needs a real canvas; the stub exposes what the view feeds it. */
const TimeSeriesChartStub = {
  props: ['series', 'unit', 'title'],
  template:
    '<div class="tsc" :data-title="title" :data-series-count="series.length" :data-labels="series.map(s => s.label).join(\'|\')"><slot name="footer" /></div>',
}

const mount = () =>
  vtuMount(WaterQualityView, { global: { stubs: { TimeSeriesChart: TimeSeriesChartStub } } })

function rec(over: Partial<NearshoreRecord> = {}): NearshoreRecord {
  return {
    time: new Date('2026-08-30T18:00:00Z'),
    waterTemp: 70, // 'Pleasant' band — the cold-shock note must appear anyway
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
const buoyRec = (waterTemp: number | null) => ({
  time: new Date('2026-08-30T18:00:00Z'),
  waterTemp,
  airTemp: 71,
  windSpeed: 4,
})

beforeEach(() => {
  window.history.replaceState(null, '', '/lake-conditions?cc-view=water-quality')
  resetRegistryForTests()
  syncFromLocation()
  nearshore.mockReset().mockImplementation((id: number) => Promise.resolve(series(id, null, [])))
  buoy.mockReset().mockResolvedValue([])
  homewood.mockReset().mockResolvedValue(series(-1, null, []))
})

const chartTitles = (w: ReturnType<typeof mount>) =>
  w.findAll('.tsc').map((c) => c.attributes('data-title'))

describe('WaterQualityView (charts)', () => {
  it('shows all six parameter charts for the whole lake when nothing is selected', async () => {
    nearshore.mockImplementation((id: number) =>
      Promise.resolve(id === 2 || id === 4 ? series(id, `NS ${id}`, [rec()]) : series(id, null, [])),
    )
    const w = mount()
    await flushPromises()
    expect(chartTitles(w)).toEqual([
      'Water temperature',
      'Wave height',
      'Turbidity',
      'Conductivity',
      'Dissolved oxygen',
      'Chlorophyll',
    ])
    expect(w.text()).toContain('Whole lake — all reporting stations')
    // Two reporting stations overlaid per chart
    expect(w.find('.tsc').attributes('data-series-count')).toBe('2')
  })

  it('overlays reporting buoys on the water-temperature chart only', async () => {
    nearshore.mockImplementation((id: number) =>
      Promise.resolve(id === 2 ? series(2, 'Dollar Point', [rec()]) : series(id, null, [])),
    )
    buoy.mockImplementation((id: number) => Promise.resolve(id === 1 ? [buoyRec(67)] : []))
    const w = mount()
    await flushPromises()
    const charts = w.findAll('.tsc')
    expect(charts[0].attributes('data-labels')).toContain('(buoy)')
    expect(charts[0].attributes('data-series-count')).toBe('2')
    for (const c of charts.slice(1)) expect(c.attributes('data-labels')).not.toContain('(buoy)')
  })

  it('always shows the cold-water-shock note on the temperature chart, even at Pleasant', async () => {
    nearshore.mockImplementation((id: number) =>
      Promise.resolve(id === 4 ? series(4, 'Homewood', [rec({ waterTemp: 70 })]) : series(id, null, [])),
    )
    const w = mount()
    await flushPromises()
    expect(w.text()).toContain('Pleasant')
    expect(w.find('.wq-cold-note').text()).toBe(COLD_WATER_SHOCK_NOTE)
    expect(w.findAll('.wq-cold-note')).toHaveLength(1) // temperature chart only
  })

  it('filters charts to the selected destination in memory, naming stations from the registry', async () => {
    nearshore.mockImplementation((id: number) => Promise.resolve(series(id, `API name ${id}`, [rec()])))
    homewood.mockResolvedValue(series(-1, 'Homewood TC', [rec()]))
    const { selectDestination } = useConditionsState()
    selectDestination('homewood') // static registry: stations [4, 5], includesHomewood
    const w = mount()
    await flushPromises()
    // Registry names win over the API's Station_Name; homewood has no
    // registry entry in the static fallback, so the API name covers it.
    const labels = w.find('.tsc').attributes('data-labels')
    expect(labels).toBe('Homewood|NS Station 5|Homewood TC')
  })

  it('interprets each station via band chips with a conservative consensus', async () => {
    nearshore.mockImplementation((id: number) =>
      Promise.resolve(
        id === 2
          ? series(2, 'Dollar Point', [rec({ turbidity: 10 })]) // Slightly cloudy
          : id === 4
            ? series(4, 'Homewood', [rec({ turbidity: 0.5 })]) // Crystal clear
            : series(id, null, []),
      ),
    )
    const w = mount()
    await flushPromises()
    // Turbidity chart: differing bands -> no consensus sentence
    expect(w.text()).toContain('Slightly cloudy')
    expect(w.text()).toContain('Crystal clear')
    expect(w.text()).toContain('different bands by station')
    // Conductivity chart: same band both stations -> consensus sentence
    expect(w.text()).toContain("Dissolved-mineral levels are in the lake's normal range.")
  })

  it('gives implausible dissolved-oxygen readings no interpretation band', async () => {
    nearshore.mockImplementation((id: number) =>
      Promise.resolve(id === 2 ? series(2, 'Dollar Point', [rec({ dissolvedOxygen: 250 })]) : series(id, null, [])),
    )
    const w = mount()
    await flushPromises()
    const doChart = w.findAll('.tsc')[4]
    expect(doChart.attributes('data-title')).toBe('Dissolved oxygen')
    expect(doChart.find('.wq-chip').exists()).toBe(false)
  })

  it('a focused station displays its registry name, not the API Station_Name', async () => {
    nearshore.mockImplementation((id: number) =>
      Promise.resolve(id === 2 ? series(2, 'Dollar Point (API)', [rec()]) : series(id, null, [])),
    )
    const { focusStation } = useConditionsState()
    focusStation({ kind: 'nearshore', sourceId: 2, name: 'Dollar Point' })
    const w = mount()
    await flushPromises()
    expect(w.find('.wq-title').text()).toBe('Dollar Point')
    expect(w.text()).not.toContain('(API)')
  })

  it('shows a focused buoy only its temperature chart, with an honest explanation', async () => {
    buoy.mockImplementation((id: number) => Promise.resolve(id === 2 ? [buoyRec(67)] : []))
    const { focusStation } = useConditionsState()
    focusStation({ kind: 'buoy', sourceId: 2, name: 'NASA Buoy TB2' })
    const w = mount()
    await flushPromises()
    expect(chartTitles(w)).toEqual(['Water temperature'])
    expect(w.text()).toContain('Mid-lake buoys measure water temperature only')
  })

  it('marks the active range for assistive technology', async () => {
    const w = mount()
    await flushPromises()
    const pressed = w.findAll('.wq-range-btn').map((b) => [b.text(), b.attributes('aria-pressed')])
    expect(pressed).toEqual([
      ['7 days', 'true'],
      ['14 days', 'false'],
      ['30 days', 'false'],
    ])
  })

  it('a stale slower load cannot overwrite a newer one', async () => {
    let resolveOld!: (v: unknown) => void
    const oldRequest = new Promise((r) => (resolveOld = r))
    nearshore.mockImplementation((id: number, start: Date, end: Date) => {
      const windowDays = Math.round((end.getTime() - start.getTime()) / 864e5)
      // The abandoned 7-day sweep reports station 4; the newer 30-day
      // sweep reports only station 2 — committing the stale result would
      // add a Homewood series to the charts.
      if (id === 4 && windowDays === 7) return oldRequest
      if (id === 2 && windowDays === 30) return Promise.resolve(series(2, null, [rec()]))
      return Promise.resolve(series(id, null, []))
    })
    const w = mount()
    await w.findAll('.wq-range-btn').find((b) => b.text() === '30 days')!.trigger('click')
    await flushPromises()
    expect(w.find('.tsc').attributes('data-labels')).toBe('Dollar Point')
    // The abandoned 7-day request finally resolves — it must be discarded.
    resolveOld(series(4, null, [rec()]))
    await flushPromises()
    expect(w.find('.tsc').attributes('data-labels')).toBe('Dollar Point')
  })

  it('reports failed fetches as a data problem, never as stations not reporting', async () => {
    nearshore.mockImplementation((id: number) =>
      id === 2 ? Promise.reject(new Error('boom')) : Promise.resolve(series(id, null, [])),
    )
    const w = mount()
    await flushPromises()
    const warn = w.find('.wq-fetch-warn')
    expect(warn.exists()).toBe(true)
    expect(warn.text()).toContain('Dollar Point')
    // With failures present, the empty state must not claim a normal state.
    expect(w.text()).toContain('Some station requests failed')
    expect(w.text()).not.toContain('a normal state')
  })

  it('tells the visitor when a focused buoy has no data in the window', async () => {
    const { focusStation } = useConditionsState()
    focusStation({ kind: 'buoy', sourceId: 2, name: 'NASA Buoy TB2' })
    const w = mount()
    await flushPromises()
    expect(w.text()).toContain('Mid-lake buoys measure water temperature only')
    expect(w.text()).toContain('No data for NASA Buoy TB2')
  })

  it('refetches when the range changes and reports empty windows honestly', async () => {
    const w = mount()
    await flushPromises()
    const callsAt7 = nearshore.mock.calls.length
    await w.findAll('.wq-range-btn').find((b) => b.text() === '30 days')!.trigger('click')
    await flushPromises()
    expect(nearshore.mock.calls.length).toBeGreaterThan(callsAt7)
    const [, start, end] = nearshore.mock.calls[nearshore.mock.calls.length - 1] as [number, Date, Date]
    expect((end.getTime() - start.getTime()) / 86_400_000).toBeCloseTo(30, 1)
    expect(w.text()).toContain('No data for Whole lake')
  })
})
