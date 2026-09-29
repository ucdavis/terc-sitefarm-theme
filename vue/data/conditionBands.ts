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
 *   field_sf_brand_color  optional UC Davis brand color for the band's
 *                         chip (TERC-60/TERC-77). SiteFarm's OWN field,
 *                         re-used on this vocabulary by hand — see
 *                         docs/manual-site-setup.md §1. It stores the brand
 *                         IDENTIFIER ("tahoe"), never a hex, and its select
 *                         gets SiteFarm's color-swatch picker for free:
 *                         sitefarm_core wraps any select whose field name
 *                         contains `field_sf_brand`. It replaced a reference
 *                         to an sf_branding term (TERC-77): that dropdown was
 *                         plain text, and on these sites the vocabulary has
 *                         six duplicate names and is missing six colors.
 */
import { miscCache, TTL } from '../core/cache'
import { tracedFetch } from '../core/requestLog'
import { isUsableBrand } from '../config/brandPalette'
import {
  applyConditionBands,
  type Band,
  type QualityMetric,
  type QualityTone,
} from '../config/qualitative'

const BANDS_PATH = '/jsonapi/taxonomy_term/condition_bands?page[limit]=50'
const BRAND_FIELD = 'field_sf_brand_color'

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
  id?: string
  attributes: Record<string, unknown>
}

export interface BandsBody {
  data: TermResource[]
}

/**
 * The band's brand identifier. Undefined when the field is empty or absent
 * (the band keeps its tone default, silently — that is the normal state on a
 * site that has not set colors). An identifier outside the audited palette
 * warns naming the band: content may only name a color, never define one, so
 * a hex typed into the field can never reach a chip.
 */
function brandIdentifier(term: TermResource, label: string): string | undefined {
  const identifier = term.attributes[BRAND_FIELD]
  if (typeof identifier !== 'string' || identifier === '') return undefined
  if (isUsableBrand(identifier)) return identifier
  console.warn(
    `[terc] condition band "${label}" has brand color "${identifier}", which is not in the audited palette; using the tone default for it`,
  )
  return undefined
}

/**
 * Group terms by metric and order each metric's bands by ascending max,
 * the open-ended (null-max) band last as Infinity. Ordering is derived
 * from the values, never from term weights — a misordered vocabulary
 * cannot produce wrong assessments.
 */
export function adaptConditionBands(body: BandsBody): Partial<Record<QualityMetric, Band[]>> {
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
    const brand = brandIdentifier(term, label)
    ;(out[metric] ??= []).push(brand ? { label, sentence, tone, max, brand } : { label, sentence, tone, max })
  }
  for (const bands of Object.values(out)) {
    bands?.sort((a, b) => a.max - b.max)
  }
  return out
}

export async function fetchConditionBands(): Promise<Partial<Record<QualityMetric, Band[]>>> {
  return miscCache.getOrFetch('condition-bands', TTL.SHORT, async () => {
    return adaptConditionBands(await fetchBandsBody())
  })
}

/**
 * One plain request. The color rides along as an ordinary attribute, so a
 * site that has not added the field yet simply has no value there — no
 * include to reject, and nothing to fall back from (TERC-77).
 */
async function fetchBandsBody(): Promise<BandsBody> {
  const res = await tracedFetch(BANDS_PATH)
  if (!res.ok) throw new Error(`condition bands HTTP ${res.status}`)
  return res.json()
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
