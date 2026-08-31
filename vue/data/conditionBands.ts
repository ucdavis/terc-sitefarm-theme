/**
 * Editor-owned condition interpretation bands (TERC-52).
 *
 * Fetches the condition_bands taxonomy over the site's own JSON:API and
 * adapts it to the Band shape config/qualitative.ts consumes — TERC's
 * scientists own the thresholds, labels, tones, and sentences; code only
 * owns the fallback placeholders. Same degradation story as the station
 * registry (TERC-46): static bands render immediately and stand in
 * whenever site content is missing or unreachable, per metric.
 *
 * Vocabulary schema (verified against tercdev, 2026-08-31):
 *   name                  band label shown to visitors
 *   field_metric_key      parameter select list (water_temp, wave_height,
 *                         air_temp, wind_speed, dissolved_oxygen,
 *                         turbidity, conductivity, chlorophyll)
 *   field_band_max_value  exclusive upper bound in display units;
 *                         null on exactly one band per metric (the
 *                         open-ended top band)
 *   field_band_tone       good | fair | caution | info
 *   field_band_sentence   one-line plain-language explanation
 */
import { miscCache, TTL } from '../core/cache'
import {
  applyConditionBands,
  type Band,
  type QualityMetric,
  type QualityTone,
} from '../config/qualitative'

const BANDS_PATH = '/jsonapi/taxonomy_term/condition_bands?page[limit]=50'

/** Site select-list keys -> the data layer's metric keys. */
const SITE_METRIC_TO_CODE: Record<string, QualityMetric> = {
  water_temp: 'waterTemp',
  wave_height: 'waveHeight',
  air_temp: 'airTemp',
  wind_speed: 'windSpeed',
  dissolved_oxygen: 'dissolvedOxygen',
  turbidity: 'turbidity',
  conductivity: 'conductivity',
  chlorophyll: 'chlorophyll',
}

const TONES = new Set<QualityTone>(['good', 'fair', 'caution', 'info'])

interface TermResource {
  attributes: Record<string, unknown>
}

/**
 * Group terms by metric and order each metric's bands by ascending max,
 * the open-ended (null-max) band last as Infinity. Ordering is derived
 * from the values, never from term weights — a misordered vocabulary
 * cannot produce wrong assessments.
 */
export function adaptConditionBands(body: {
  data: TermResource[]
}): Partial<Record<QualityMetric, Band[]>> {
  const out: Partial<Record<QualityMetric, Band[]>> = {}
  for (const term of body.data) {
    const a = term.attributes
    const metric = SITE_METRIC_TO_CODE[String(a.field_metric_key ?? '')]
    const label = String(a.name ?? '').trim()
    const tone = String(a.field_band_tone ?? '') as QualityTone
    const sentence = String(a.field_band_sentence ?? '').trim()
    const rawMax = a.field_band_max_value
    if (!metric || !label || !sentence || !TONES.has(tone)) continue
    const max =
      rawMax === null || rawMax === undefined ? Number.POSITIVE_INFINITY : Number(rawMax)
    if (Number.isNaN(max)) continue
    ;(out[metric] ??= []).push({ label, sentence, tone, max })
  }
  for (const bands of Object.values(out)) {
    bands?.sort((a, b) => a.max - b.max)
  }
  return out
}

export async function fetchConditionBands(): Promise<Partial<Record<QualityMetric, Band[]>>> {
  return miscCache.getOrFetch('condition-bands', TTL.SHORT, async () => {
    const res = await fetch(BANDS_PATH)
    if (!res.ok) throw new Error(`condition bands HTTP ${res.status}`)
    return adaptConditionBands(await res.json())
  })
}

let loadStarted = false

/** Idempotent on success; called from shell mount. Failure keeps the
 *  static bands AND re-arms the guard so a later mount can retry. */
export async function loadConditionBands(): Promise<void> {
  if (loadStarted) return
  loadStarted = true
  try {
    applyConditionBands(await fetchConditionBands())
  } catch (err) {
    loadStarted = false
    console.error('[terc] condition bands fetch failed, using static fallback', err)
  }
}

/** Test hook. */
export function resetConditionBandsForTests(): void {
  loadStarted = false
}
