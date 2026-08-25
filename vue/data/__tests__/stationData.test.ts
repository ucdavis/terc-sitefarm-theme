import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchMetStation,
  fetchNearshoreRange,
  latestRecord,
} from '../stationData'

// Rows mirror the live ns-station-range shape (re-verified 2026-08-24):
// flat objects, every value a string, TmStamp with no zone marker.
const NS_ROWS = [
  {
    ID: '2', Station_Name: 'Dollar Point', TmStamp: '2026-08-23 00:00:00',
    LS_Temp_Avg: '21.4313', WaveHeight: '0.09105206', LS_Turbidity_Avg: '1.2',
    Conductivity25C_Avg: '0.09', LS_DO_Avg: '95.5', LS_Chlorophyll_Avg: '-9.0',
  },
  {
    ID: '2', Station_Name: 'Dollar Point', TmStamp: '2026-08-23 00:20:00',
    LS_Temp_Avg: '21.5', WaveHeight: '-9.0', LS_Turbidity_Avg: '1.3',
    Conductivity25C_Avg: '0.09', LS_DO_Avg: '96.0', LS_Chlorophyll_Avg: '2.1',
  },
]

// met-uscg2020 returns NEWEST-first (live finding) — keep that order here so
// the sort behavior is actually exercised. Includes a valid winter air temp
// below -9 °C, the field-aware sentinel case.
const MET_ROWS = [
  {
    TmStamp: '2026-01-10 00:40:00', AirTemp_C: '-12.5', WaterTemp_C: '5.1',
    WindSpd_ms: '3.62', WindSpdMax_ms: '7.0', WindDir_deg: '225',
    RH_percent: '80', BP_mbar: '1013',
  },
  {
    TmStamp: '2026-01-10 00:20:00', AirTemp_C: '-9.0', WaterTemp_C: '5.0',
    WindSpd_ms: '2.0', WindSpdMax_ms: '4.1', WindDir_deg: '220',
    RH_percent: '82', BP_mbar: '1012',
  },
]

function mockFetch(payload: unknown) {
  const spy = vi.fn(async (_url: string) => ({ ok: true, json: async () => payload }))
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// Unique date windows per test so the module-level stationCache never
// serves one test's data to another.
const win = (() => {
  let day = 1
  return () => {
    day += 1
    return [new Date(Date.UTC(2020, 0, day, 12)), new Date(Date.UTC(2020, 0, day + 1, 12))] as const
  }
})()

describe('fetchNearshoreRange', () => {
  it('normalizes rows: converts units, nulls sentinels, keeps station name', async () => {
    mockFetch(NS_ROWS)
    const [start, end] = win()
    const series = await fetchNearshoreRange(2, start, end)
    expect(series.stationName).toBe('Dollar Point')
    expect(series.records).toHaveLength(2)
    const [first, second] = series.records
    expect(first.waterTemp).toBeCloseTo((21.4313 * 9) / 5 + 32, 3) // °C -> °F
    expect(first.waveHeight).toBeCloseTo(0.09105206 * 3.28084, 4) // m -> ft
    expect(first.chlorophyll).toBeNull() // -9.0 sentinel
    expect(second.waveHeight).toBeNull() // -9.0 sentinel
    expect(second.chlorophyll).toBeCloseTo(2.1)
  })

  it('parses TmStamp as UTC', async () => {
    mockFetch([NS_ROWS[0]])
    const [start, end] = win()
    const series = await fetchNearshoreRange(3, start, end)
    expect(series.records[0].time.toISOString()).toBe('2026-08-23T00:00:00.000Z')
  })

  it('treats an empty response as data, not an error', async () => {
    mockFetch([])
    const [start, end] = win()
    const series = await fetchNearshoreRange(4, start, end)
    expect(series.records).toEqual([])
    expect(series.stationName).toBeNull()
  })

  it('builds UTC YYYYMMDD request params (matching the API day boundaries)', async () => {
    const spy = mockFetch([])
    const [start, end] = win()
    await fetchNearshoreRange(5, start, end)
    const url = spy.mock.calls[0][0]
    expect(url).toMatch(/ns-station-range\?id=5&rptdate=\d{8}&rptend=\d{8}$/)
  })

  it('serves repeat calls for the same window from cache (no second fetch)', async () => {
    const spy = mockFetch(NS_ROWS)
    const [start, end] = win()
    await fetchNearshoreRange(6, start, end)
    await fetchNearshoreRange(6, start, end)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })))
    const [start, end] = win()
    await expect(fetchNearshoreRange(7, start, end)).rejects.toThrow('Station data request failed (HTTP 502)')
  })
})

describe('fetchMetStation', () => {
  it('sorts newest-first responses ascending and keeps valid winter air temps', async () => {
    mockFetch(MET_ROWS)
    const [start, end] = win()
    const records = await fetchMetStation(start, end)
    expect(records[0].time.getTime()).toBeLessThan(records[1].time.getTime())
    // -9.0 °C exact sentinel -> null; -12.5 °C valid -> converted to °F.
    expect(records[0].airTemp).toBeNull()
    expect(records[1].airTemp).toBeCloseTo((-12.5 * 9) / 5 + 32, 3)
    expect(latestRecord(records)?.airTemp).toBeCloseTo(9.5, 1)
  })
})
