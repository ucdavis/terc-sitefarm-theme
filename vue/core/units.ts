/**
 * Unit conversion and value validation. This is the ONLY place raw API
 * strings become numbers — components never convert units.
 *
 * Sentinels: the REST API uses -9.0 for "no reading" (Tahoe Vista returns it
 * for turbidity and chlorophyll). Any value <= -9 is rejected to null during
 * normalization and never charted or averaged.
 *
 * Range validation: some readings are implausible (dissolved oxygen came
 * back as 118 at one station and 45 at another — physically impossible as
 * mg/L). We keep the value but flag it, so the UI can render it as suspect
 * rather than as fact.
 */

export const SENTINEL_THRESHOLD = -9

export function cToF(c: number): number {
  return (c * 9) / 5 + 32
}
export function mToFt(m: number): number {
  return m * 3.28084
}
export function msToMph(ms: number): number {
  return ms * 2.236936
}
export function msToFtPerMin(ms: number): number {
  return ms * 196.850394
}
export function kmhToMs(kmh: number): number {
  return kmh / 3.6
}

/** Parse a raw API string; reject NaN and sentinel values (<= -9). */
export function parseReading(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  const n = typeof raw === 'number' ? raw : Number.parseFloat(raw)
  if (!Number.isFinite(n)) return null
  if (n <= SENTINEL_THRESHOLD) return null
  return n
}

/** Plausible physical ranges, in the RAW (metric) units the API reports. */
export const PLAUSIBLE_RANGES: Record<string, { min: number; max: number; label: string }> = {
  waterTempC: { min: 0, max: 35, label: 'water temperature' },
  waveHeightM: { min: 0, max: 3, label: 'wave height' },
  turbidityNTU: { min: 0, max: 200, label: 'turbidity' },
  conductivity: { min: 0, max: 2, label: 'conductivity' },
  // Dissolved oxygen is PERCENT SATURATION, not mg/L. Confirmed against the
  // reference site's chart (y-axis "DISSOLVED OXYGEN (%)", diurnal swings
  // ~40–150%): live values of 43 and 118 match that cycle exactly.
  // Supersaturation >100% is normal in the afternoon; >200% is flagged.
  dissolvedOxygen: { min: 0, max: 200, label: 'dissolved oxygen (% saturation)' },
  chlorophyll: { min: 0, max: 100, label: 'chlorophyll' },
  airTempC: { min: -35, max: 45, label: 'air temperature' },
  windMs: { min: 0, max: 60, label: 'wind speed' },
}

export function isPlausible(rangeKey: keyof typeof PLAUSIBLE_RANGES, value: number): boolean {
  const r = PLAUSIBLE_RANGES[rangeKey]
  if (!r) return true
  return value >= r.min && value <= r.max
}

export function fmt(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}
