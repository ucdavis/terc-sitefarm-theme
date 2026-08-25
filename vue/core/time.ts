/**
 * Timezone pinning — TERC-43.
 *
 * FINDING (2026-08-24, live traffic): TERC report-API TmStamp strings
 * ("2026-08-24 23:00:00", no zone marker) are UTC, not Pacific — at
 * 23:19 UTC / 16:19 PDT the newest record read 23:00:00, and a UTC-today
 * rptdate param returned exactly the UTC day's records from 00:00:00.
 * The prototype assumed wall-clock Pacific (its stated ASSUMPTION); that
 * made every displayed timestamp 7-8 hours wrong. parseTmStamp therefore
 * parses UTC, and fmtDateParam builds UTC calendar dates for rptdate/
 * rptend. Lake-time (America/Los_Angeles) helpers remain for DISPLAY and
 * for UI calendar logic, pinned so non-Pacific viewers see lake time.
 *
 * Implementation note: rather than shipping a tz library, this uses the
 * platform's own IANA zone database through Intl.DateTimeFormat, which every
 * supported browser and Node ships with. The wall-time -> instant conversion
 * is the standard two-pass fixed-point: guess the instant, format it back
 * into the zone, correct by the difference. It converges in <= 2 passes for
 * every real instant; the one irreducible edge is the nonexistent
 * spring-forward hour (e.g. 02:30 on the March changeover), which resolves
 * to the instant after the jump — acceptable for 20-minute sensor data.
 */

export const LAKE_TZ = 'America/Los_Angeles'

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: LAKE_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

interface WallParts {
  y: number
  mo: number
  d: number
  h: number
  mi: number
  s: number
}

/** The wall-clock parts a given instant shows on a Lake Tahoe clock. */
export function lakeWallParts(date: Date): WallParts {
  const p: Record<string, string> = {}
  for (const { type, value } of partsFmt.formatToParts(date)) p[type] = value
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second }
}

/** The instant at which a Lake Tahoe wall clock reads the given time. */
export function lakeWallTimeToDate(
  y: number,
  mo: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
): Date {
  const target = Date.UTC(y, mo - 1, d, h, mi, s)
  let guess = target
  for (let i = 0; i < 2; i++) {
    const w = lakeWallParts(new Date(guess))
    const wallAsUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s)
    const diff = target - wallAsUtc
    if (diff === 0) break
    guess += diff
  }
  return new Date(guess)
}

/** Parse an API TmStamp ("2026-08-24 23:00:00" — UTC, see module docs). */
export function parseTmStamp(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return new Date(NaN)
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]))
}

/** The YYYYMMDD rptdate/rptend parameter for an instant — UTC calendar,
 *  matching the API's UTC day boundaries (see module docs). */
export function fmtDateParam(d: Date): string {
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${mo}${day}`
}

/** The most recent UTC midnight — the API's "today" boundary. */
export function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** The instant lake-time midnight most recently occurred. */
export function startOfTodayLakeTime(now: Date = new Date()): Date {
  const w = lakeWallParts(now)
  return lakeWallTimeToDate(w.y, w.mo, w.d)
}
