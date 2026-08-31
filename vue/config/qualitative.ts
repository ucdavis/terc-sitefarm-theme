/**
 * Plain-language interpretation bands for condition readings — what a
 * visitor (swimmer, angler, paddler) should take away from a number
 * (TERC-21).
 *
 * ⚠ SCIENCE REVIEW NEEDED — these thresholds are placeholders drawn from
 * general limnology guidance, not TERC's own criteria. Each metric has 3–4
 * deliberate bands (not a continuum) so the message stays simple; sentences
 * are written for laypeople and kept to one line.
 *
 * TERC-52: these bands are editor-owned site content — the condition_bands
 * taxonomy, fetched via JSON:API (data/conditionBands.ts) and applied here
 * with applyConditionBands(). This file is the static fallback, exactly
 * like config/stations.ts is for the registry: it renders immediately and
 * whenever site content is unreachable. The bands live in a Vue ref, so
 * every computed that calls assessMetric re-renders when site bands land.
 *
 * Units match the normalized data layer: temperatures in °F, wave height in
 * ft, wind in mph, DO in % saturation, turbidity in NTU, conductivity in
 * mS/cm, chlorophyll in µg/L.
 */

import { ref } from 'vue'

export type QualityTone = 'good' | 'fair' | 'caution' | 'info'

/**
 * Standing safety note shown with EVERY water-temperature display,
 * regardless of band — demo feedback: cold-water shock messaging must
 * appear even when the reading is "Pleasant". Tahoe's deep water stays
 * dangerously cold year-round no matter what the surface reads.
 */
export const COLD_WATER_SHOCK_NOTE =
  "Even on warm days, water below the surface layer stays dangerously cold — sudden immersion can cause cold-water shock. Enter gradually, stay close to shore, and wear a life vest on any craft."

export interface QualityAssessment {
  label: string
  sentence: string
  tone: QualityTone
}

export interface Band extends QualityAssessment {
  /** Upper bound (exclusive); use Infinity for the last band. */
  max: number
}

export const STATIC_BANDS: Record<string, Band[]> = {
  waterTemp: [
    {
      max: 50,
      label: 'Very cold',
      tone: 'caution',
      sentence:
        'Dangerously cold for swimming — cold-water shock is a real risk. Wetsuits essential, stay close to shore.',
    },
    {
      max: 60,
      label: 'Cold',
      tone: 'caution',
      sentence: 'Cold enough to take your breath away — keep swims short or wear a wetsuit.',
    },
    {
      max: 68,
      label: 'Cool',
      tone: 'fair',
      sentence: 'Refreshing but chilly — fine for a quick swim on a hot day, cold for a long soak.',
    },
    {
      max: 75,
      label: 'Pleasant',
      tone: 'good',
      sentence: 'Comfortable swimming temperatures by mountain-lake standards.',
    },
    {
      max: Number.POSITIVE_INFINITY,
      label: 'Warm',
      tone: 'info',
      sentence: 'Unusually warm for Tahoe — easy swimming, and worth savoring.',
    },
  ],
  waveHeight: [
    {
      max: 0.5,
      label: 'Calm',
      tone: 'good',
      sentence: 'Flat water — ideal for paddleboarding, kayaking, and swimming.',
    },
    {
      max: 1.5,
      label: 'Light chop',
      tone: 'fair',
      sentence: 'Small waves — fine for most boats, a bit of a workout for paddlers.',
    },
    {
      max: 3,
      label: 'Choppy',
      tone: 'caution',
      sentence:
        'Rough going for paddlecraft and small boats — stay near shore and wear a life vest.',
    },
    {
      max: Number.POSITIVE_INFINITY,
      label: 'Rough',
      tone: 'caution',
      sentence: 'Large waves for Tahoe — hazardous for small craft; consider staying off the water.',
    },
  ],
  airTemp: [
    {
      max: 32,
      label: 'Freezing',
      tone: 'caution',
      sentence: 'Below freezing — bundle up, and watch for icy footing along the shore.',
    },
    {
      max: 50,
      label: 'Cold',
      tone: 'fair',
      sentence: 'A cold day at the lake — dress in warm layers.',
    },
    {
      max: 65,
      label: 'Cool',
      tone: 'fair',
      sentence:
        'Cool air — comfortable for hiking and paddling; bring a layer for out on the water.',
    },
    {
      max: 80,
      label: 'Pleasant',
      tone: 'good',
      sentence: 'Comfortable air temperatures for just about anything on or off the water.',
    },
    {
      max: Number.POSITIVE_INFINITY,
      label: 'Hot',
      tone: 'info',
      sentence:
        'A hot one for Tahoe — sun builds fast at altitude, so plan for shade and water.',
    },
  ],
  windSpeed: [
    {
      max: 5,
      label: 'Light air',
      tone: 'good',
      sentence: 'Barely a breeze — glassy water and easy paddling.',
    },
    {
      max: 12,
      label: 'Breezy',
      tone: 'fair',
      sentence: 'A steady breeze — expect some chop away from shore; fine for most boats.',
    },
    {
      max: 20,
      label: 'Windy',
      tone: 'caution',
      sentence: 'Strong enough to build whitecaps — paddlers should stay close to shore.',
    },
    {
      max: Number.POSITIVE_INFINITY,
      label: 'Very windy',
      tone: 'caution',
      sentence:
        'Strong wind — small-craft caution; expect rough water and blowing sand at beaches.',
    },
  ],
  dissolvedOxygen: [
    {
      max: 50,
      label: 'Low oxygen',
      tone: 'caution',
      sentence:
        'Oxygen is on the low side right now — fish often move deeper and bite less until levels recover.',
    },
    {
      max: 80,
      label: 'Moderate',
      tone: 'fair',
      sentence:
        'Enough oxygen for healthy aquatic life, though fish may be a little less active than usual.',
    },
    {
      max: 120,
      label: 'Healthy',
      tone: 'good',
      sentence:
        'Well-oxygenated water — good conditions for fish and everything else living in the lake.',
    },
    {
      max: Number.POSITIVE_INFINITY,
      label: 'Supersaturated',
      tone: 'info',
      sentence:
        'Daytime photosynthesis has pushed oxygen above 100% — a normal sunny-afternoon pattern; fish are typically active.',
    },
  ],
  turbidity: [
    {
      max: 1,
      label: 'Crystal clear',
      tone: 'good',
      sentence: 'Exceptional clarity — you can see far into the water. Classic Tahoe.',
    },
    {
      max: 5,
      label: 'Clear',
      tone: 'good',
      sentence: 'Clear water with good visibility for swimming and snorkeling.',
    },
    {
      max: 20,
      label: 'Slightly cloudy',
      tone: 'fair',
      sentence:
        'Some suspended sediment — visibility is reduced, which is common after wind, waves, or runoff.',
    },
    {
      max: Number.POSITIVE_INFINITY,
      label: 'Murky',
      tone: 'caution',
      sentence:
        'Poor visibility from stirred-up sediment — swimming and sight-fishing will be limited today.',
    },
  ],
  conductivity: [
    {
      max: 0.15,
      label: 'Typical for Tahoe',
      tone: 'good',
      sentence: "Dissolved-mineral levels are in the lake's normal range.",
    },
    {
      max: 0.5,
      label: 'Elevated',
      tone: 'fair',
      sentence: "More dissolved material than Tahoe's baseline — often follows storm runoff.",
    },
    {
      max: Number.POSITIVE_INFINITY,
      label: 'High',
      tone: 'caution',
      sentence: 'Unusually high dissolved solids — can indicate strong runoff or a nearby inflow.',
    },
  ],
  chlorophyll: [
    {
      max: 2.5,
      label: 'Very low algae',
      tone: 'good',
      sentence: 'Almost no algae in the water — clarity is at its best.',
    },
    {
      max: 10,
      label: 'Some algae',
      tone: 'fair',
      sentence: 'Modest algae growth — normal for near-shore water in summer.',
    },
    {
      max: 30,
      label: 'High algae',
      tone: 'caution',
      sentence: 'Noticeable algae — the water may look greenish near shore.',
    },
    {
      max: Number.POSITIVE_INFINITY,
      label: 'Bloom-level algae',
      tone: 'caution',
      sentence: 'Algae at bloom levels — avoid swallowing water and rinse off after swimming.',
    },
  ],
}

export type QualityMetric = keyof typeof STATIC_BANDS

/**
 * The bands assessMetric consults — static until site content arrives.
 * A ref so band swaps propagate through every computed using assessMetric.
 */
const activeBands = ref<Record<string, Band[]>>(STATIC_BANDS)

/** True once editor-owned site bands replaced the static placeholders. */
export const bandsFromSite = ref(false)

/**
 * Swap in site-owned bands (TERC-52). Per-metric fallback: a metric with no
 * usable site bands keeps its static ones, so a partially filled vocabulary
 * can never blank out part of the UI.
 */
export function applyConditionBands(site: Partial<Record<QualityMetric, Band[]>>): void {
  const merged: Record<string, Band[]> = { ...STATIC_BANDS }
  let any = false
  for (const [metric, bands] of Object.entries(site)) {
    if (metric in STATIC_BANDS && bands && bands.length > 0) {
      merged[metric] = bands
      any = true
    }
  }
  activeBands.value = merged
  bandsFromSite.value = any
}

/** Test hook: back to the static placeholder bands. */
export function resetBandsForTests(): void {
  activeBands.value = STATIC_BANDS
  bandsFromSite.value = false
}

export function assessMetric(
  metric: QualityMetric,
  value: number | null | undefined,
): QualityAssessment | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  const bands = activeBands.value[metric]
  if (!bands || bands.length === 0) return null
  const band = bands.find((b) => value < b.max) ?? bands[bands.length - 1]
  return { label: band.label, sentence: band.sentence, tone: band.tone }
}
