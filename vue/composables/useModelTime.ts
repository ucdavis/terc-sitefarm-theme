import { computed, ref } from 'vue'
import { createTimeAxis, PLAY_TICK_MS } from './timeAxis'
import { fetchModelManifest, type ModelFrame } from '../data/modeledGrid'

/**
 * Shared date+hour selection for every Forecasted Conditions view
 * (TERC-22) — module-scope singleton so switching views preserves the
 * selected time, exactly like the Phase 1 destination selection.
 *
 * The temperature and flow manifests have identical frame lists (verified
 * live: both 205 entries, same names), so the selector is driven from the
 * temperature list and frames are looked up per-variable when fetching.
 */
/**
 * Calendar days of history the time picker keeps before "today" (TERC-80).
 *
 * TERC's manifest accumulates about two weeks of frames — each model run
 * republishes roughly a week of hindcast alongside a forecast only ~12 h
 * ahead — so the date picker used to open onto a fortnight of the past. This
 * is a FORECAST page: keep a few days of context, and everything ahead.
 */
export const FORECAST_LOOKBACK_DAYS = 3

/** "2026-09-17" shifted by whole calendar days; the label is date-only, so
 *  UTC arithmetic here cannot slip across a timezone boundary. */
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * The frames the picker offers: every frame from `lookbackDays` calendar days
 * before "today" onward — all future frames always kept, whole lake-time days
 * so the first date in the dropdown is never a partial one.
 *
 * "Today" is the date of the frame CLOSEST TO NOW — the same frame the
 * picker selects by default. That is deliberately not now's own calendar
 * date: when the model is stale the closest frame is simply the latest one,
 * so the window keeps the most recent days the model did produce. Stale is
 * not hypothetical — in Sep 2026 the last run ended on the 17th while the
 * calendar reached the 22nd, and a cutoff of "now minus three days" would
 * have left the picker empty.
 */
export function forecastWindow(
  list: readonly ModelFrame[],
  now: number,
  lookbackDays: number = FORECAST_LOOKBACK_DAYS,
): ModelFrame[] {
  if (list.length === 0) return []
  let anchor = list[0]
  let best = Number.POSITIVE_INFINITY
  for (const f of list) {
    const dist = Math.abs(f.time.getTime() - now)
    if (dist < best) {
      best = dist
      anchor = f
    }
  }
  const firstDate = shiftDate(anchor.date, -lookbackDays)
  return list.filter((f) => f.date >= firstDate)
}

/**
 * How far the newest forecast may fall behind the present before the page
 * says the forecast is out of date (TERC-92).
 *
 * In normal operation the model publishes daily and each run reaches about
 * three days ahead, so the newest frame sits days in the FUTURE; a frame
 * behind "now" at all means runs have been missed. Three hours — one 2-hour
 * frame step plus slack — keeps the notice off in the edge case of a run
 * landing a little late, and nothing else.
 *
 * Found the hard way: the model stopped after its Sep 16 2026 run, and the
 * page kept opening on Sep 17 with no sign it was days old.
 */
export const STALE_AFTER_HOURS = 3

export interface ForecastStaleness {
  /** The newest frame the model has published. */
  latest: ModelFrame
  /** How far that frame is behind now, ms. */
  behindMs: number
}

/** Non-null when the newest forecast is more than `staleAfterHours` behind
 *  now — i.e. there is no forecast for the present, let alone the future. */
export function forecastStaleness(
  list: readonly ModelFrame[],
  now: number,
  staleAfterHours: number = STALE_AFTER_HOURS,
): ForecastStaleness | null {
  if (list.length === 0) return null
  let latest = list[0]
  for (const f of list) if (f.time.getTime() > latest.time.getTime()) latest = f
  const behindMs = now - latest.time.getTime()
  return behindMs > staleAfterHours * 3_600_000 ? { latest, behindMs } : null
}

const model = createTimeAxis<ModelFrame>()
const manifestError = ref<string | null>(null)
const loaded = ref(false)

/** Re-exported: tests and views imported it from here before TERC-93. */
export { PLAY_TICK_MS }

async function ensureManifest() {
  if (loaded.value || model.axis.frames.value.length > 0) return
  try {
    const manifest = await fetchModelManifest()
    // The two lists are identical in practice; fall back to flow if
    // temperature ever ships empty. BOTH empty is an honest unavailable
    // state, not a quiet success: report it and stay retryable
    // (PR review finding).
    const list = manifest.temperature.length ? manifest.temperature : manifest.flow
    if (list.length === 0) {
      manifestError.value = 'no forecast frames are currently published'
      return
    }
    // Defaults to the frame closest to "now" (see createTimeAxis).
    model.setFrames(forecastWindow(list, Date.now()))
    loaded.value = true
    manifestError.value = null
  } catch (e) {
    // Not sticky: the next ensureManifest() call (any view mount or view
    // switch) retries, mirroring conditionBands' re-arm-on-failure rule.
    manifestError.value = e instanceof Error ? e.message : String(e)
  }
}

/**
 * The model's time axis — TERC's temperature/flow frames — shared by the
 * temperature and currents views. Wave height has its own axis (useWaveTime,
 * TERC-93). Module scope: one selection per page, kept across view switches.
 */
export function useModelTime() {
  // Evaluated when the manifest loads (the shell loads it on mount). A tab
  // left open for days would not re-evaluate by itself, but it would not get
  // a new forecast either until reloaded, which re-runs this.
  const staleness = computed(() => forecastStaleness(model.axis.frames.value, Date.now()))
  return {
    ...model.axis,
    staleness,
    manifestError,
    ensureManifest,
  }
}

/** Reset the module-scope singleton between tests. */
export function resetModelTimeForTests(): void {
  model.reset()
  manifestError.value = null
  loaded.value = false
}
