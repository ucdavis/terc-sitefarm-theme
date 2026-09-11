/**
 * Real-time station data module — TERC REST report API (tepfsail50). This is
 * the ONE normalized interface every Current Conditions block reads live
 * station data through (TERC-16). Ported from the terc-vue-prototype with
 * two upgrades: timestamps are parsed with an explicit zone (core/time.ts,
 * TERC-43 — TmStamp turned out to be UTC, not the Pacific the prototype
 * assumed; see core/time.ts for the evidence) and parseReading is
 * field-aware so valid winter air temperatures below -9 °C survive
 * normalization (PR review finding on TERC-14).
 *
 * All responses are JSON arrays of flat objects where every value is a
 * string (live shape re-verified 2026-08-24: same keys, string values,
 * oldest-first on ns-station-range).
 *
 * Empty arrays are NORMAL — most stations return no data. Callers get an
 * empty records array, never an exception, for that case.
 *
 * NOTE on Climate Impacts: a `qs-*` 30-day historical endpoint family is
 * referenced in TERC's ticketing but never appeared in live traffic and may
 * not exist. We deliberately do NOT call it — Climate Impacts charts are
 * built from ns-station-range over a wider date range instead.
 */
import { REPORT_BASE } from '../config/endpoints'
import { stationCache, TTL, type StoredRow } from '../core/cache'
import { fmtDateParam, parseTmStamp, startOfTodayUtc } from '../core/time'
import { noteRecords, tracedFetch } from '../core/requestLog'
import { reportQueue, type Priority } from '../core/requestQueue'
import { cToF, mToFt, msToMph, parseReading } from '../core/units'

/**
 * Per-request options (TERC-70). `priority` orders the report-API queue:
 * 'high' for what the visitor is looking at (selected destination, lake
 * weather), 'low' for the map's overview badges, 'normal' otherwise.
 */
export interface FetchOpts {
  priority?: Priority
}

export interface NearshoreRecord {
  time: Date
  /** °F */
  waterTemp: number | null
  /** ft */
  waveHeight: number | null
  /** NTU */
  turbidity: number | null
  /** mS/cm (as reported) */
  conductivity: number | null
  /** % saturation (confirmed against the reference site's DO chart) */
  dissolvedOxygen: number | null
  /** as reported */
  chlorophyll: number | null
}

export interface NearshoreSeries {
  stationId: number
  /** Station_Name from the API when data exists, else null. Display uses
   *  the registry (editor-owned) name first; this is the fallback for
   *  stations the registry doesn't know, and a diagnostic for mismatches. */
  stationName: string | null
  records: NearshoreRecord[]
}

export interface MetRecord {
  time: Date
  /** °F */
  airTemp: number | null
  /** °F */
  waterTemp: number | null
  /** mph */
  windSpeed: number | null
  /** mph */
  windGust: number | null
  /** degrees */
  windDir: number | null
  /** % */
  humidity: number | null
  /** mbar */
  pressure: number | null
}

/**
 * The one network path for the report API: queued, so at most a few
 * requests are in flight at a time (see core/requestQueue.ts), and traced
 * for the diagnostics panel.
 */
async function fetchJsonArray(url: string, priority: Priority = 'normal'): Promise<Record<string, string>[]> {
  return reportQueue.run(url, priority, () => fetchJsonArrayNow(url))
}

async function fetchJsonArrayNow(url: string): Promise<Record<string, string>[]> {
  const res = await tracedFetch(url)
  if (!res.ok) {
    // Error messages surface in the UI via RequestState — keep the endpoint
    // URL out of them and log it here for diagnostics instead.
    console.error(`[terc] station request failed: HTTP ${res.status}`, url)
    throw new Error(`Station data request failed (HTTP ${res.status})`)
  }
  const body = await res.json()
  if (!Array.isArray(body)) {
    console.error('[terc] unexpected station response shape', url)
    throw new Error('Station data response had an unexpected shape')
  }
  noteRecords(url, body.length)
  return body
}

/**
 * FINDING (2026-07-29, live traffic): record order differs BY ENDPOINT —
 * ns-station-range returns oldest-first, met-uscg2020 returns NEWEST-first.
 * All fetchers sort ascending after parsing so "latest record" logic never
 * depends on which endpoint the data came from.
 */
function sortByTime<T extends { time: Date }>(records: T[]): T[] {
  return records.sort((a, b) => a.time.getTime() - b.time.getTime())
}

/** TTL is short when the window includes the current UTC day (the API's
 *  day boundary; new records arrive every 20 min); historical windows
 *  never change. */
function ttlForWindow(end: Date): number {
  return end >= startOfTodayUtc() ? TTL.SHORT : TTL.FOREVER
}

/**
 * "Last known reading" rows (TERC-70). A window that reaches today is the
 * live one, so its result is also remembered under a window-free key that
 * survives reloads and day changes; views read it with the readStored*
 * functions to paint at once and say when it was last checked, while the
 * real request waits its turn in the queue. Never used as fresh data.
 */
function isLiveWindow(end: Date): boolean {
  return end >= startOfTodayUtc()
}
function remember(end: Date, key: string, value: unknown): void {
  if (isLiveWindow(end)) stationCache.putStored(key, value)
}

function parseNearshoreRows(rows: Record<string, string>[]): NearshoreRecord[] {
  return sortByTime(
    rows.map((r) => {
      const tempC = parseReading(r.LS_Temp_Avg, 'waterTempC')
      const waveM = parseReading(r.WaveHeight, 'waveHeightM')
      return {
        time: parseTmStamp(r.TmStamp),
        waterTemp: tempC === null ? null : cToF(tempC),
        waveHeight: waveM === null ? null : mToFt(waveM),
        turbidity: parseReading(r.LS_Turbidity_Avg, 'turbidityNTU'),
        conductivity: parseReading(r.Conductivity25C_Avg, 'conductivity'),
        dissolvedOxygen: parseReading(r.LS_DO_Avg, 'dissolvedOxygen'),
        chlorophyll: parseReading(r.LS_Chlorophyll_Avg, 'chlorophyll'),
      }
    }),
  )
}

export async function fetchNearshoreRange(
  stationId: number,
  start: Date,
  end: Date,
  opts: FetchOpts = {},
): Promise<NearshoreSeries> {
  const startP = fmtDateParam(start)
  const endP = fmtDateParam(end)
  const key = `ns-station-range:${stationId}:${startP}-${endP}`
  const url = `${REPORT_BASE}/ns-station-range?id=${stationId}&rptdate=${startP}&rptend=${endP}`
  const priority = opts.priority ?? 'normal'
  // A more urgent caller joining an in-flight request still moves it up.
  reportQueue.raise(url, priority)
  return stationCache.getOrFetch(key, ttlForWindow(end), async () => {
    const rows = await fetchJsonArray(url, priority)
    const series: NearshoreSeries = {
      stationId,
      stationName: rows.length > 0 ? rows[0].Station_Name : null,
      records: parseNearshoreRows(rows),
    }
    if (series.records.length) remember(end, lastKnownKey('nearshore', stationId), series)
    return series
  })
}

/** Key of a source's last-known-reading row. */
export function lastKnownKey(kind: 'nearshore' | 'buoy' | 'homewood' | 'met', id: number): string {
  return `last-known:${kind}:${id}`
}

/** The last nearshore series we managed to fetch for a station, if any. */
export function readStoredNearshore(stationId: number): Promise<StoredRow<NearshoreSeries> | undefined> {
  return stationCache.readStored<NearshoreSeries>(lastKnownKey('nearshore', stationId))
}
export function readStoredMet(): Promise<StoredRow<MetRecord[]> | undefined> {
  return stationCache.readStored<MetRecord[]>(lastKnownKey('met', 1))
}
export function readStoredBuoy(buoyId: number): Promise<StoredRow<NasaBuoyRecord[]> | undefined> {
  return stationCache.readStored<NasaBuoyRecord[]>(lastKnownKey('buoy', buoyId))
}
export function readStoredHomewood(): Promise<StoredRow<NearshoreSeries> | undefined> {
  return stationCache.readStored<NearshoreSeries>(lastKnownKey('homewood', -1))
}

export function peekNearshoreRange(
  stationId: number,
  start: Date,
  end: Date,
): NearshoreSeries | undefined {
  const key = `ns-station-range:${stationId}:${fmtDateParam(start)}-${fmtDateParam(end)}`
  return stationCache.peek(key)
}

export async function fetchMetStation(start: Date, end: Date, opts: FetchOpts = {}): Promise<MetRecord[]> {
  const startP = fmtDateParam(start)
  const endP = fmtDateParam(end)
  const key = `met-uscg2020:1:${startP}-${endP}`
  const url = `${REPORT_BASE}/met-uscg2020?id=1&rptdate=${startP}&rptend=${endP}`
  const priority = opts.priority ?? 'normal'
  reportQueue.raise(url, priority)
  return stationCache.getOrFetch(key, ttlForWindow(end), async () => {
    const rows = await fetchJsonArray(url, priority)
    const records = sortByTime(
      rows.map((r) => {
        // airTempC is the field-aware sentinel path: Tahoe winter air can
        // legitimately drop below -9 °C.
        const airC = parseReading(r.AirTemp_C, 'airTempC')
        const waterC = parseReading(r.WaterTemp_C, 'waterTempC')
        const windMs = parseReading(r.WindSpd_ms, 'windMs')
        const gustMs = parseReading(r.WindSpdMax_ms, 'windMs')
        return {
          time: parseTmStamp(r.TmStamp),
          airTemp: airC === null ? null : cToF(airC),
          waterTemp: waterC === null ? null : cToF(waterC),
          windSpeed: windMs === null ? null : msToMph(windMs),
          windGust: gustMs === null ? null : msToMph(gustMs),
          windDir: parseReading(r.WindDir_deg),
          humidity: parseReading(r.RH_percent),
          pressure: parseReading(r.BP_mbar),
        }
      }),
    )
    if (records.length) remember(end, lastKnownKey('met', 1), records)
    return records
  })
}

export interface NasaBuoyRecord {
  time: Date
  /** °F, RBR sensor at 0.5 m depth */
  waterTemp: number | null
  /** °F, mean of the two air-temp sensors that report */
  airTemp: number | null
  /** mph, mean of the two anemometers that report */
  windSpeed: number | null
}

export async function fetchNasaBuoy(
  buoyId: number,
  start: Date,
  end: Date,
  opts: FetchOpts = {},
): Promise<NasaBuoyRecord[]> {
  const startP = fmtDateParam(start)
  const endP = fmtDateParam(end)
  const key = `nasa-tb:${buoyId}:${startP}-${endP}`
  const url = `${REPORT_BASE}/nasa-tb?id=${buoyId}&rptdate=${startP}&rptend=${endP}`
  const priority = opts.priority ?? 'normal'
  reportQueue.raise(url, priority)
  return stationCache.getOrFetch(key, ttlForWindow(end), async () => {
    const rows = await fetchJsonArray(url, priority)
    const mean = (a: number | null, b: number | null) =>
      a !== null && b !== null ? (a + b) / 2 : a ?? b
    const records = sortByTime(
      rows.map((r): NasaBuoyRecord => {
        const waterC = parseReading(r.RBR_0p5_m, 'waterTempC')
        const airC = mean(parseReading(r.AirTemp_1, 'airTempC'), parseReading(r.AirTemp_2, 'airTempC'))
        const windMs = mean(parseReading(r.WindSpeed_1, 'windMs'), parseReading(r.WindSpeed_2, 'windMs'))
        return {
          time: parseTmStamp(r.TmStamp),
          waterTemp: waterC === null ? null : cToF(waterC),
          airTemp: airC === null ? null : cToF(airC),
          windSpeed: windMs === null ? null : msToMph(windMs),
        }
      }),
    )
    if (records.length) remember(end, lastKnownKey('buoy', buoyId), records)
    return records
  })
}

/** tc-homewood has no id param; returned an empty array in all testing. */
export async function fetchHomewood(start: Date, end: Date, opts: FetchOpts = {}): Promise<NearshoreSeries> {
  const startP = fmtDateParam(start)
  const endP = fmtDateParam(end)
  const key = `tc-homewood:${startP}-${endP}`
  const url = `${REPORT_BASE}/tc-homewood?rptdate=${startP}&rptend=${endP}`
  const priority = opts.priority ?? 'normal'
  reportQueue.raise(url, priority)
  return stationCache.getOrFetch(key, ttlForWindow(end), async () => {
    const rows = await fetchJsonArray(url, priority)
    const series: NearshoreSeries = {
      stationId: -1,
      // Null when empty, like every other fetcher — the UI supplies the
      // display-name fallback for non-reporting stations.
      stationName: rows[0]?.Station_Name ?? null,
      records: parseNearshoreRows(rows),
    }
    if (series.records.length) remember(end, lastKnownKey('homewood', -1), series)
    return series
  })
}

/** Latest record (records are always sorted ascending by the fetchers). */
export function latestRecord<T extends { time: Date }>(records: T[]): T | null {
  return records.length ? records[records.length - 1] : null
}
