import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { miscCache } from '../../core/cache'
import {
  compassName,
  durationToHours,
  epochHour,
  fetchWindTimeline,
  MAX_WIND_HOUR_OFFSET,
  windForTime,
  type WindTimeline,
} from '../noaa'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  miscCache.delete('noaa-wind')
})
afterEach(() => {
  miscCache.delete('noaa-wind')
  vi.unstubAllGlobals()
})

function noaaBody(
  speeds: { validTime: string; value: number | null }[],
  dirs: { validTime: string; value: number | null }[],
  uom = 'wmoUnit:km_h-1',
) {
  return {
    ok: true,
    json: async () => ({
      properties: {
        windSpeed: { uom, values: speeds },
        windDirection: { uom: 'wmoUnit:degree_(angle)', values: dirs },
      },
    }),
  }
}

describe('durationToHours', () => {
  it('parses the NOAA duration forms', () => {
    expect(durationToHours('PT1H')).toBe(1)
    expect(durationToHours('PT6H')).toBe(6)
    expect(durationToHours('P1D')).toBe(24)
    expect(durationToHours('P1DT6H')).toBe(30)
  })

  it('never returns less than one hour, even for junk', () => {
    expect(durationToHours('PT30M')).toBe(1)
    expect(durationToHours('nonsense')).toBe(1)
  })
})

describe('fetchWindTimeline', () => {
  it('expands multi-hour entries and converts km/h to m/s', async () => {
    fetchMock.mockResolvedValueOnce(
      noaaBody(
        [{ validTime: '2026-09-02T00:00:00+00:00/PT3H', value: 36 }], // 10 m/s
        [{ validTime: '2026-09-02T00:00:00+00:00/PT3H', value: 270 }],
      ),
    )
    const t = await fetchWindTimeline()
    const h0 = epochHour(new Date('2026-09-02T00:00:00Z'))
    expect(t.byHour.size).toBe(3)
    for (const h of [h0, h0 + 1, h0 + 2]) {
      expect(t.byHour.get(h)?.speedMs).toBeCloseTo(10)
      expect(t.byHour.get(h)?.dirDeg).toBe(270)
    }
    expect(t.byHour.get(h0)?.speedMph).toBeCloseTo(22.37, 1)
  })

  it('reads the unit rather than assuming it', async () => {
    fetchMock.mockResolvedValueOnce(
      noaaBody(
        [{ validTime: '2026-09-02T00:00:00+00:00/PT1H', value: 10 }],
        [{ validTime: '2026-09-02T00:00:00+00:00/PT1H', value: 90 }],
        'wmoUnit:m_s-1',
      ),
    )
    const t = await fetchWindTimeline()
    expect([...t.byHour.values()][0].speedMs).toBe(10)
  })

  it('drops hours that lack a direction, and null values', async () => {
    fetchMock.mockResolvedValueOnce(
      noaaBody(
        [
          { validTime: '2026-09-02T00:00:00+00:00/PT2H', value: 36 },
          { validTime: '2026-09-02T05:00:00+00:00/PT1H', value: null },
        ],
        [{ validTime: '2026-09-02T00:00:00+00:00/PT1H', value: 270 }],
      ),
    )
    const t = await fetchWindTimeline()
    expect(t.byHour.size).toBe(1) // only the hour with BOTH speed and direction
  })

  it('surfaces a malformed response as an error, not empty wind', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ properties: {} }) })
    await expect(fetchWindTimeline()).rejects.toThrow(/missing windSpeed/)
    miscCache.delete('noaa-wind')
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    await expect(fetchWindTimeline()).rejects.toThrow(/503/)
  })
})

describe('windForTime', () => {
  const h0 = epochHour(new Date('2026-09-02T12:00:00Z'))
  const timeline: WindTimeline = {
    byHour: new Map([[h0, { speedMs: 5, speedMph: 11.2, dirDeg: 270 }]]),
    firstHour: h0,
    lastHour: h0,
    speedUom: 'wmoUnit:km_h-1',
  }

  it('returns the exact hour with no offset', () => {
    const m = windForTime(timeline, new Date('2026-09-02T12:30:00Z'))
    expect(m).toEqual({ wind: timeline.byHour.get(h0), offsetHours: 0 })
  })

  it('borrows a neighbouring hour within tolerance, reporting the offset', () => {
    const m = windForTime(timeline, new Date('2026-09-02T14:00:00Z'))
    expect(m?.offsetHours).toBe(-2)
  })

  it('returns null beyond tolerance rather than wind from an unrelated hour', () => {
    // The model manifest reaches ~2 weeks back; NOAA does not. Those hours
    // must render an honest empty state, not a wave field built from
    // whatever wind happened to be nearest.
    expect(windForTime(timeline, new Date('2026-09-01T12:00:00Z'))).toBeNull()
    const justOutside = new Date((h0 + MAX_WIND_HOUR_OFFSET + 1) * 3_600_000)
    expect(windForTime(timeline, justOutside)).toBeNull()
  })
})

describe('compassName', () => {
  it('names the cardinal and intercardinal points', () => {
    expect(compassName(0)).toBe('north')
    expect(compassName(90)).toBe('east')
    expect(compassName(180)).toBe('south')
    expect(compassName(270)).toBe('west')
    expect(compassName(225)).toBe('southwest')
  })

  it('rounds to the nearest of 16 points and wraps', () => {
    expect(compassName(348.75)).toBe('north')
    expect(compassName(360)).toBe('north')
    expect(compassName(-90)).toBe('west')
    expect(compassName(240)).toBe('west-southwest')
  })
})
