/**
 * NOAA gridpoint wind forecast (keyless) — TERC-24.
 *
 * Wave height isn't modeled live: TERC precomputed a STWAVE solution for
 * every wind speed/direction pair, so picking the right one starts with
 * knowing the wind. This module turns NOAA's forecast into an hourly
 * lookup.
 *
 * properties.windSpeed.values[] entries look like
 *   { validTime: "2026-09-02T12:00:00+00:00/PT4H", value: N }
 * i.e. an ISO instant plus an ISO 8601 duration — one entry can cover many
 * hours, so they're expanded into a per-hour map keyed by epoch-hour
 * (timezone-independent by construction).
 *
 * The unit is read from properties.windSpeed.uom (observed live:
 * "wmoUnit:km_h-1"), never assumed.
 *
 * WINDOW (measured 2026-09-02): roughly −13 h to +174 h from now, while the
 * model manifest reaches ~2 weeks back. Most past model hours therefore
 * have no wind forecast at all — see MAX_WIND_HOUR_OFFSET.
 */
import { NOAA_GRIDPOINT } from '../config/endpoints'
import { miscCache, TTL } from '../core/cache'
import { kmhToMs, msToMph } from '../core/units'

export interface HourlyWind {
  /** m/s — selects the wave bucket. */
  speedMs: number
  /** mph — for display. */
  speedMph: number
  /** Degrees the wind blows FROM (meteorological convention). */
  dirDeg: number
}

export interface WindTimeline {
  /** epoch-hour (ms / 3_600_000, floored) -> wind */
  byHour: Map<number, HourlyWind>
  firstHour: number
  lastHour: number
  speedUom: string
}

interface NoaaValue {
  validTime: string
  value: number | null
}

/**
 * How far the wind may be borrowed from a neighbouring hour before the
 * answer stops being about the hour the visitor asked for. Small gaps
 * happen inside the window (speed and direction entries don't always
 * align); anything beyond this is outside the forecast entirely, and the
 * view says so rather than drawing waves from unrelated wind.
 */
export const MAX_WIND_HOUR_OFFSET = 2

/** Parse "PT1H", "PT3H", "P1DT6H" … into whole hours (minimum 1). */
export function durationToHours(iso: string): number {
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (!m) return 1
  const days = Number.parseInt(m[1] ?? '0', 10)
  const hours = Number.parseInt(m[2] ?? '0', 10)
  return Math.max(1, days * 24 + hours)
}

export function epochHour(d: Date): number {
  return Math.floor(d.getTime() / 3_600_000)
}

function expand(values: NoaaValue[], apply: (h: number, v: number) => void) {
  for (const entry of values) {
    if (entry.value === null) continue
    const [instant, duration] = entry.validTime.split('/')
    const start = new Date(instant)
    if (Number.isNaN(start.getTime())) continue
    const hours = durationToHours(duration ?? 'PT1H')
    const h0 = epochHour(start)
    for (let i = 0; i < hours; i++) apply(h0 + i, entry.value)
  }
}

/**
 * Fails closed on an unfamiliar unit rather than assuming one. Wind speed
 * doesn't just get displayed — it selects the wave solution, so a wrong
 * conversion would show confidently wrong wave heights lake-wide. The
 * view has an explicit error state; a silent bad guess has nothing.
 */
function toMs(value: number, uom: string): number {
  if (uom.includes('km_h')) return kmhToMs(value)
  if (uom.includes('m_s')) return value
  if (uom.includes('kn')) return value * 0.514444
  throw new Error(`NOAA reported wind in an unrecognized unit ("${uom}")`)
}

export async function fetchWindTimeline(): Promise<WindTimeline> {
  return miscCache.getOrFetch('noaa-wind', TTL.SHORT, async () => {
    // Browsers set User-Agent automatically. Any Node-side fetch of this
    // URL must set a descriptive one or NOAA rejects it.
    const res = await fetch(NOAA_GRIDPOINT, { headers: { Accept: 'application/geo+json' } })
    if (!res.ok) throw new Error(`NOAA gridpoints HTTP ${res.status}`)
    const body = await res.json()
    const speedProp = body?.properties?.windSpeed
    const dirProp = body?.properties?.windDirection
    if (!speedProp?.values || !dirProp?.values) {
      throw new Error('NOAA response missing windSpeed/windDirection values')
    }
    // Also fail closed when the unit is missing entirely — same reason.
    const speedUom: string | undefined = speedProp.uom
    if (!speedUom) throw new Error('NOAA response omitted the wind speed unit')

    const speeds = new Map<number, number>()
    const dirs = new Map<number, number>()
    expand(speedProp.values as NoaaValue[], (h, v) => speeds.set(h, v))
    expand(dirProp.values as NoaaValue[], (h, v) => dirs.set(h, v))

    const byHour = new Map<number, HourlyWind>()
    for (const [h, raw] of speeds) {
      const dir = dirs.get(h)
      if (dir === undefined) continue
      const speedMs = toMs(raw, speedUom)
      byHour.set(h, { speedMs, speedMph: msToMph(speedMs), dirDeg: dir })
    }
    const hours = [...byHour.keys()].sort((a, b) => a - b)
    if (hours.length === 0) throw new Error('NOAA returned no overlapping wind hours')
    return { byHour, firstHour: hours[0], lastHour: hours[hours.length - 1], speedUom }
  })
}

export interface WindMatch {
  wind: HourlyWind
  /** Hours between the wind used and the hour asked for (0 = exact). */
  offsetHours: number
}

/**
 * Wind for an instant. Returns null when the hour is outside the forecast
 * window by more than MAX_WIND_HOUR_OFFSET — callers must render an honest
 * "no wind forecast for this hour" state instead of drawing a wave field
 * from unrelated wind.
 */
export function windForTime(timeline: WindTimeline, time: Date): WindMatch | null {
  const h = epochHour(time)
  const exact = timeline.byHour.get(h)
  if (exact) return { wind: exact, offsetHours: 0 }
  for (let d = 1; d <= MAX_WIND_HOUR_OFFSET; d++) {
    for (const candidate of [h - d, h + d]) {
      const w = timeline.byHour.get(candidate)
      if (w) return { wind: w, offsetHours: candidate - h }
    }
  }
  return null
}

const COMPASS = [
  'north', 'north-northeast', 'northeast', 'east-northeast',
  'east', 'east-southeast', 'southeast', 'south-southeast',
  'south', 'south-southwest', 'southwest', 'west-southwest',
  'west', 'west-northwest', 'northwest', 'north-northwest',
]

/** Plain-language compass name for a bearing — "240°" means little to
 *  most visitors, and nothing at all when read aloud. */
export function compassName(dirDeg: number): string {
  const i = Math.round((((dirDeg % 360) + 360) % 360) / 22.5) % 16
  return COMPASS[i]
}
