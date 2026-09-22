import { computed, ref } from 'vue'
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

const frames = ref<ModelFrame[]>([])
const selectedIndex = ref<number>(-1)
const manifestError = ref<string | null>(null)
const loaded = ref(false)

/**
 * "Next 24 h" playback. Playing just advances selectedIndex on a timer —
 * views react exactly as they do to manual stepping, and because
 * useModeledField prefetches the whole window when playback starts, every
 * tick is a cache hit (no loading flashes mid-animation). Any manual
 * interaction (date select, hour step) cancels playback.
 */
const playing = ref(false)
const playTargetIndex = ref<number | null>(null)
let playTimer: ReturnType<typeof setInterval> | null = null
export const PLAY_TICK_MS = 700

function stopPlay() {
  playing.value = false
  playTargetIndex.value = null
  if (playTimer) {
    clearInterval(playTimer)
    playTimer = null
  }
}

function playNext24h() {
  const i0 = selectedIndex.value
  const f0 = frames.value[i0]
  if (!f0) return
  const limit = f0.time.getTime() + 24 * 3_600_000
  let end = i0
  for (let j = i0 + 1; j < frames.value.length; j++) {
    if (frames.value[j].time.getTime() > limit) break
    end = j
  }
  if (end <= i0) return
  stopPlay()
  playing.value = true
  playTargetIndex.value = end
  playTimer = setInterval(() => {
    const target = playTargetIndex.value
    if (target === null || selectedIndex.value >= target) {
      stopPlay()
      return
    }
    selectedIndex.value++
    if (selectedIndex.value >= target) stopPlay()
  }, PLAY_TICK_MS)
}

async function ensureManifest() {
  if (loaded.value || frames.value.length > 0) return
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
    frames.value = forecastWindow(list, Date.now())
    if (selectedIndex.value === -1 && frames.value.length > 0) {
      // Default to the frame closest to "now".
      const now = Date.now()
      let best = 0
      let bestDist = Number.POSITIVE_INFINITY
      frames.value.forEach((f, i) => {
        const d = Math.abs(f.time.getTime() - now)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      })
      selectedIndex.value = best
    }
    loaded.value = true
    manifestError.value = null
  } catch (e) {
    // Not sticky: the next ensureManifest() call (any view mount or view
    // switch) retries, mirroring conditionBands' re-arm-on-failure rule.
    manifestError.value = e instanceof Error ? e.message : String(e)
  }
}

export function useModelTime() {
  const selectedFrame = computed<ModelFrame | null>(
    () => frames.value[selectedIndex.value] ?? null,
  )
  const dates = computed(() => [...new Set(frames.value.map((f) => f.date))])

  function selectDate(date: string) {
    stopPlay() // manual interaction cancels playback
    const current = selectedFrame.value
    // Keep the hour if that date has it, else take the date's first frame.
    const sameHour = frames.value.findIndex((f) => f.date === date && f.hour === current?.hour)
    const idx = sameHour !== -1 ? sameHour : frames.value.findIndex((f) => f.date === date)
    if (idx !== -1) selectedIndex.value = idx
  }

  function stepHour(delta: number) {
    stopPlay() // manual interaction cancels playback
    const next = selectedIndex.value + delta
    if (next >= 0 && next < frames.value.length) selectedIndex.value = next
  }

  return {
    frames,
    selectedIndex,
    selectedFrame,
    dates,
    manifestError,
    ensureManifest,
    selectDate,
    stepHour,
    playing,
    playTargetIndex,
    playNext24h,
    stopPlay,
  }
}

/** Reset the module-scope singleton between tests. */
export function resetModelTimeForTests(): void {
  stopPlay()
  frames.value = []
  selectedIndex.value = -1
  manifestError.value = null
  loaded.value = false
}
