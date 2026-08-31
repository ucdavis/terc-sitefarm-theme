// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
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
    peekNearshoreRange: () => undefined,
  }
})

import WaterQualityView from '../WaterQualityView.vue'
import {
  resetRegistryForTests,
  syncFromLocation,
  useConditionsState,
} from '../../composables/useConditionsState'

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
  window.history.replaceState(null, '', '/lake-conditions?cc-view=water-quality')
  resetRegistryForTests()
  syncFromLocation()
  nearshore.mockReset().mockImplementation((id: number) => Promise.resolve(series(id, null, [])))
  buoy.mockReset().mockResolvedValue([])
  homewood.mockReset().mockResolvedValue(series(-1, null, []))
})

describe('WaterQualityView', () => {
  it('prompts for a destination when nothing is selected', () => {
    const w = mount(WaterQualityView)
    expect(w.text()).toContain('No destination selected')
  })

  it('renders the four water-quality cards with interpretation bands for a destination', async () => {
    nearshore.mockImplementation((id: number) =>
      Promise.resolve(id === 4 ? series(4, 'Homewood (live)', [rec()]) : series(id, null, [])),
    )
    const { selectDestination } = useConditionsState()
    selectDestination('homewood')
    const w = mount(WaterQualityView)
    await flushPromises()

    expect(w.text()).toContain('Homewood (live)')
    const labels = w.findAll('.card-label').map((n) => n.text())
    expect(labels).toEqual(['Turbidity', 'Conductivity', 'Dissolved oxygen', 'Chlorophyll'])
    // Values and plain-language bands
    expect(w.text()).toContain('0.80') // turbidity, 2 digits
    expect(w.text()).toContain('Crystal clear')
    expect(w.text()).toContain('Healthy')
    // Stations with no data are listed honestly
    expect(w.text()).toContain('Not reporting:')
  })

  it('includes the tc-homewood series when the destination carries it', async () => {
    homewood.mockResolvedValue(series(-1, 'Homewood TC', [rec({ turbidity: 30 })]))
    const { selectDestination } = useConditionsState()
    selectDestination('homewood') // static registry: includesHomewood
    const w = mount(WaterQualityView)
    await flushPromises()

    expect(w.text()).toContain('Homewood TC')
    expect(w.text()).toContain('Murky')
  })

  it('reports an all-empty destination as a normal state', async () => {
    const { selectDestination } = useConditionsState()
    selectDestination('glenbrook')
    const w = mount(WaterQualityView)
    await flushPromises()
    expect(w.text()).toContain('No water-quality data for Glenbrook')
  })

  it('explains honestly that buoys do not measure water quality', async () => {
    const { focusStation } = useConditionsState()
    focusStation({ kind: 'buoy', sourceId: 2, name: 'NASA Buoy TB2' })
    const w = mount(WaterQualityView)
    await flushPromises()
    expect(w.text()).toContain("Mid-lake buoys don't report water-quality parameters")
    expect(w.findAll('.station-card')).toHaveLength(0)
  })

  it('shows cards for a focused near-shore station, preferring the API station name', async () => {
    nearshore.mockResolvedValue(series(2, 'Dollar Point (API)', [rec({ dissolvedOxygen: 250 })]))
    const { focusStation } = useConditionsState()
    focusStation({ kind: 'nearshore', sourceId: 2, name: 'Dollar Point' })
    const w = mount(WaterQualityView)
    await flushPromises()

    expect(w.text()).toContain('Dollar Point (API)')
    expect(w.findAll('.station-card')).toHaveLength(4)
    // DO of 250% sat is implausible -> suspect flag, no assessment band
    expect(w.find('.suspect').exists()).toBe(true)
  })

  it('tells the visitor when a focused station is not reporting', async () => {
    const { focusStation } = useConditionsState()
    focusStation({ kind: 'nearshore', sourceId: 7, name: 'Sand Harbor' })
    const w = mount(WaterQualityView)
    await flushPromises()
    expect(w.text()).toContain("Sand Harbor isn't reporting right now")
  })
})
