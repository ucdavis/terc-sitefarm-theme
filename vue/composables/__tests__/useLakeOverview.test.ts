import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

const nearshore = vi.fn()
const buoy = vi.fn()
const homewood = vi.fn()

vi.mock('../../data/stationData', () => ({
  fetchNearshoreRange: (...args: unknown[]) => nearshore(...args),
  fetchNasaBuoy: (...args: unknown[]) => buoy(...args),
  fetchHomewood: (...args: unknown[]) => homewood(...args),
  latestRecord: <T,>(records: T[]) => (records.length ? records[records.length - 1] : null),
}))

import { resetLakeOverviewForTests, useLakeOverview } from '../useLakeOverview'
import { resetRegistryForTests } from '../useConditionsState'
import { NASA_BUOYS, NEARSHORE_STATIONS } from '../../config/stations'

const REC = { time: new Date('2026-08-30T18:00:00Z'), waterTemp: 62.1 }

beforeEach(() => {
  resetLakeOverviewForTests()
  resetRegistryForTests()
  nearshore.mockReset().mockResolvedValue({ stationId: 0, stationName: null, records: [] })
  buoy.mockReset().mockResolvedValue([])
  homewood.mockReset().mockResolvedValue({ stationId: -1, stationName: null, records: [] })
})

describe('useLakeOverview', () => {
  it('seeds every registry water-temp station plus the homewood fallback, excluding met', () => {
    const { markers } = useLakeOverview()
    // Static registry: 12 near-shore + 4 buoys; homewood is supplied by the
    // composable until a registry can carry it; the met station is out of
    // the TERC-17 overview scope.
    expect(markers.value).toHaveLength(NEARSHORE_STATIONS.length + NASA_BUOYS.length + 1)
    expect(markers.value.filter((m) => m.kind === 'homewood')).toHaveLength(1)
    expect(markers.value.every((m) => m.status === 'loading')).toBe(true)
  })

  it('serializes keys as kind:sourceId to match the cc-station URL format', () => {
    const { markers } = useLakeOverview()
    expect(markers.value.map((m) => m.key)).toContain('nearshore:2')
    expect(markers.value.map((m) => m.key)).toContain('buoy:1')
    expect(markers.value.map((m) => m.key)).toContain('homewood:-1')
  })

  it('marks stations reporting or offline from their latest record — offline stays on the map', async () => {
    nearshore.mockImplementation((id: number) =>
      Promise.resolve({
        stationId: id,
        stationName: id === 2 ? 'Dollar Point (live)' : null,
        records: id === 2 ? [REC] : [],
      }),
    )
    buoy.mockImplementation((id: number) => Promise.resolve(id === 1 ? [REC] : []))
    const { markers } = useLakeOverview()
    await flushPromises()

    const dollar = markers.value.find((m) => m.key === 'nearshore:2')!
    expect(dollar.status).toBe('reporting')
    expect(dollar.waterTemp).toBe(62.1)
    // Registry (editor-owned) names are authoritative — the API's
    // Station_Name ('Dollar Point (live)' in this mock) must NOT win.
    expect(dollar.name).toBe('Dollar Point')

    expect(markers.value.find((m) => m.key === 'buoy:1')!.status).toBe('reporting')
    // Everything without data is offline — present, never removed.
    const rest = markers.value.filter((m) => !['nearshore:2', 'buoy:1'].includes(m.key))
    expect(rest.every((m) => m.status === 'offline')).toBe(true)
    expect(markers.value).toHaveLength(NEARSHORE_STATIONS.length + NASA_BUOYS.length + 1)
  })

  it('marks a station offline when its fetch rejects', async () => {
    nearshore.mockRejectedValue(new Error('boom'))
    const { markers } = useLakeOverview()
    await flushPromises()
    expect(markers.value.find((m) => m.key === 'nearshore:2')!.status).toBe('offline')
  })

  it('clears a stale reading when a reload fails', async () => {
    nearshore.mockResolvedValue({ stationId: 2, stationName: null, records: [REC] })
    const { markers, reload } = useLakeOverview()
    await flushPromises()
    expect(markers.value.find((m) => m.key === 'nearshore:2')!.waterTemp).toBe(62.1)

    nearshore.mockRejectedValue(new Error('transient'))
    reload()
    await flushPromises()
    const m = markers.value.find((x) => x.key === 'nearshore:2')!
    expect(m.status).toBe('offline')
    expect(m.waterTemp).toBeNull()
    expect(m.time).toBeNull()
  })

  it('requests the shared 2-day window used by the destination views', () => {
    useLakeOverview()
    const [, start, end] = nearshore.mock.calls[0] as [number, Date, Date]
    const days = (end.getTime() - start.getTime()) / 86_400_000
    expect(days).toBeCloseTo(2, 1)
  })

  it('no station claims a verified location while coordinates remain unconfirmed', () => {
    const { markers } = useLakeOverview()
    expect(markers.value.every((m) => m.locationVerified === false)).toBe(true)
  })
})
