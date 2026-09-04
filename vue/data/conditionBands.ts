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
 *   field_band_brand_color  optional reference to an sf_branding term
 *                         (TERC-60; added by scripts/condition-bands/
 *                         add-brand-color-field.php). Only the brand
 *                         IDENTIFIER (`field_sf_brand_color`) is read —
 *                         never a hex from content.
 */
import { miscCache, TTL } from '../core/cache'
import { isUsableBrand } from '../config/brandPalette'
import {
  applyConditionBands,
  type Band,
  type QualityMetric,
  type QualityTone,
} from '../config/qualitative'

const BANDS_PATH = '/jsonapi/taxonomy_term/condition_bands?page[limit]=50'
const BRAND_FIELD = 'field_band_brand_color'
/** Pull the referenced brand terms along in the same response. */
const BANDS_WITH_BRANDS_PATH = `${BANDS_PATH}&include=${BRAND_FIELD}`
const BRAND_TERM_TYPE = 'taxonomy_term--sf_branding'

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
  relationships?: Record<string, { data?: { type?: string; id?: string } | null } | undefined>
}

interface IncludedResource {
  type: string
  id: string
  attributes?: Record<string, unknown>
}

export interface BandsBody {
  data: TermResource[]
  included?: IncludedResource[]
}

/**
 * The brand identifier a term references, resolved through `included`.
 * Returns undefined when nothing is referenced; when something is but it
 * cannot be used (identifier missing from the palette, or the referenced
 * term is absent from the response), warns naming the band and returns
 * undefined so the band keeps its tone default.
 */
function brandIdentifier(term: TermResource, label: string, brands: Map<string, string>): string | undefined {
  const ref = term.relationships?.[BRAND_FIELD]?.data
  if (!ref?.id) return undefined
  const identifier = brands.get(ref.id)
  if (identifier && isUsableBrand(identifier)) return identifier
  console.warn(
    `[terc] condition band "${label}" references brand color ${identifier ? `"${identifier}"` : `term ${ref.id}`}, ` +
      (identifier ? 'which is not in the audited palette' : 'which did not come back with the bands') +
      '; using the tone default for it',
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
  const brands = new Map<string, string>()
  for (const inc of body.included ?? []) {
    const identifier = inc.attributes?.field_sf_brand_color
    if (inc.type === BRAND_TERM_TYPE && typeof identifier === 'string') brands.set(inc.id, identifier)
  }
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
    const brand = brandIdentifier(term, label, brands)
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
 * A site that has not run the TERC-60 field script yet rejects the include
 * with 400 (unknown relationship). Bands matter more than chip colors, so
 * fall back to the plain request and say why once.
 */
let brandFieldMissingWarned = false
async function fetchBandsBody(): Promise<BandsBody> {
  const withBrands = await fetch(BANDS_WITH_BRANDS_PATH)
  if (withBrands.ok) return withBrands.json()
  if (withBrands.status !== 400) throw new Error(`condition bands HTTP ${withBrands.status}`)
  if (!brandFieldMissingWarned) {
    brandFieldMissingWarned = true
    console.warn(
      `[terc] this site has no ${BRAND_FIELD} on condition_bands yet (run scripts/condition-bands/add-brand-color-field.php); band chips use tone colors`,
    )
  }
  const plain = await fetch(BANDS_PATH)
  if (!plain.ok) throw new Error(`condition bands HTTP ${plain.status}`)
  return plain.json()
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
  brandFieldMissingWarned = false
}
