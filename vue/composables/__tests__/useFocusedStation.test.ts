// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

const nearshore = vi.fn()
const buoy = vi.fn()
const homewood = vi.fn()
// Remembered readings (TERC-70): undefined unless a test seeds one.
const stored = vi.fn(async (_kind: string, _id?: number): Promise<unknown> => undefined)

vi.mock('../../data/stationData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/stationData')>()
  return {
    ...actual,
    fetchNearshoreRange: (...args: unknown[]) => nearshore(...args),
    fetchNasaBuoy: (...args: unknown[]) => buoy(...args),
    fetchHomewood: (...args: unknown[]) => homewood(...args),
    readStoredNearshore: (id: number) => stored('nearshore', id),
    readStoredBuoy: (id: number) => stored('buoy', id),
    readStoredHomewood: () => stored('homewood'),
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
  stored.mockReset().mockResolvedValue(undefined)
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

  describe('remembered readings (TERC-70, Copilot PR #39)', () => {
    it('hydrates a focused nearshore card from its stored row instead of showing a skeleton', async () => {
      let release!: (v: unknown) => void
      nearshore.mockImplementation(() => new Promise((r) => (release = r)))
      stored.mockImplementation(async (kind: string, id?: number) =>
        kind === 'nearshore' && id === 4 ? { value: series(4, [rec]), storedAt: 1 } : undefined,
      )
      const { nearshoreState } = useFocusedStation()
      useConditionsState().focusStation({ kind: 'nearshore', sourceId: 4, name: 'Homewood' })
      await flushPromises()
      expect(nearshoreState.value.status).toBe('success')
      expect(nearshoreState.value.fromCache).toBe(true)
      expect(nearshoreState.value.error).toBeNull()
      release(series(4, [rec, { ...rec, waterTemp: 66 }]))
      await flushPromises()
      expect(nearshoreState.value.fromCache).toBe(false)
      expect(nearshoreState.value.data!.records).toHaveLength(2)
    })

    it('hydrates a focused buoy card too, and keeps the reading when the refresh fails', async () => {
      buoy.mockRejectedValue(new Error('offline'))
      stored.mockImplementation(async (kind: string, id?: number) =>
        kind === 'buoy' && id === 2 ? { value: [rec], storedAt: 1 } : undefined,
      )
      const { buoyState } = useFocusedStation()
      useConditionsState().focusStation({ kind: 'buoy', sourceId: 2, name: 'NASA Buoy TB2' })
      await flushPromises()
      expect(buoyState.value.status).toBe('success')
      expect(buoyState.value.data).toEqual([rec])
      expect(buoyState.value.error).toBe('offline') // the failure is reported, not swallowed
      expect(buoyState.value.fromCache).toBe(true)
    })

    it('still fails honestly when nothing was remembered', async () => {
      nearshore.mockRejectedValue(new Error('boom'))
      const { nearshoreState } = useFocusedStation()
      useConditionsState().focusStation({ kind: 'nearshore', sourceId: 4, name: 'Homewood' })
      await flushPromises()
      expect(nearshoreState.value.status).toBe('error')
      expect(nearshoreState.value.data).toBeNull()
    })
  })
})
