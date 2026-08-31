// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

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

import { useFocusedStation } from '../useFocusedStation'
import {
  resetRegistryForTests,
  syncFromLocation,
  useConditionsState,
} from '../useConditionsState'

const series = (stationId: number, records: unknown[]) => ({
  stationId,
  stationName: null,
  records,
})
const rec = { time: new Date('2026-08-30T18:00:00Z'), waterTemp: 65 }

beforeEach(() => {
  window.history.replaceState(null, '', '/lake-conditions')
  resetRegistryForTests()
  syncFromLocation()
  nearshore.mockReset()
  buoy.mockReset().mockResolvedValue([])
  homewood.mockReset().mockResolvedValue(series(-1, []))
})

describe('useFocusedStation', () => {
  it('a slower response for a previously focused station cannot overwrite the current one', async () => {
    let resolveSlow!: (v: unknown) => void
    nearshore.mockImplementation((id: number) => {
      if (id === 7) return new Promise((r) => (resolveSlow = r)) // first click, slow
      return Promise.resolve(series(id, [rec])) // second click, fast
    })
    const { focusStation } = useConditionsState()
    const { nearshoreState } = useFocusedStation()

    focusStation({ kind: 'nearshore', sourceId: 7, name: 'Sand Harbor' })
    await flushPromises()
    focusStation({ kind: 'nearshore', sourceId: 2, name: 'Dollar Point' })
    await flushPromises()
    expect(nearshoreState.value.status).toBe('success')
    expect(nearshoreState.value.data?.stationId).toBe(2)

    // Sand Harbor's abandoned request finally resolves — it must be ignored.
    resolveSlow(series(7, [rec]))
    await flushPromises()
    expect(nearshoreState.value.data?.stationId).toBe(2)
  })
})
