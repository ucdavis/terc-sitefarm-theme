import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import { type RequestState, empty, failure, idle, loading, success } from '../core/requestState'
import type { ScalarGrid } from '../data/gridDecode'
import {
  fetchWindTimeline,
  windForTime,
  type HourlyWind,
  type WindTimeline,
} from '../data/noaa'
import {
  fetchWaveGrid,
  peekWaveGrid,
  snapToBucket,
  WS_RANGE,
  type WaveBucket,
} from '../data/waveHeight'
import { useModelTime } from './useModelTime'

/**
 * Drives the Wave Height view (TERC-24): selected hour → NOAA wind →
 * nearest precomputed STWAVE bucket → grid.
 *
 * Two things make this different from useModeledField:
 *  - The wind forecast covers roughly −13 h to +174 h, while the model
 *    manifest reaches ~2 weeks back. Hours with no wind get an explicit
 *    empty state, never a wave field derived from unrelated wind.
 *  - Many hours share a bucket, so prefetch resolves upcoming hours to
 *    their buckets first and fetches only the DISTINCT ones — a stable
 *    wind day animates on one or two downloads.
 */
export function useWaveField() {
  const time = useModelTime()
  const state = ref<RequestState<ScalarGrid>>(idle())
  const wind = ref<HourlyWind | null>(null)
  /** Hours between the wind used and the hour selected (0 = exact). */
  const windOffsetHours = ref(0)
  const bucket = ref<WaveBucket | null>(null)
  /** A neighbouring bucket stood in because the exact one was missing. */
  const substituted = ref(false)
  /** The wind forecast itself failed — distinct from a missing hour. */
  const windError = ref<string | null>(null)

  let timeline: WindTimeline | null = null
  let generation = 0
  let settleTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      generation++
      if (settleTimer) clearTimeout(settleTimer)
    })
  }

  /** Resolve an hour to its bucket, or null when wind doesn't cover it. */
  function bucketForTime(t: Date): WaveBucket | null {
    if (!timeline) return null
    const match = windForTime(timeline, t)
    return match ? snapToBucket(match.wind.speedMs, match.wind.dirDeg) : null
  }

  /** Warm the DISTINCT buckets a set of frame indices resolves to. */
  function prefetchBuckets(indices: number[]) {
    const seen = new Set<string>()
    for (const i of indices) {
      const frame = time.frames.value[i]
      if (!frame) continue
      const b = bucketForTime(frame.time)
      if (!b) continue
      const key = `${b.ws}:${b.wd}`
      if (seen.has(key)) continue
      seen.add(key)
      if (!peekWaveGrid(b)) void fetchWaveGrid(b).catch(() => {})
    }
  }

  async function load() {
    const frame = time.selectedFrame.value
    if (!frame) return
    const gen = ++generation

    if (!timeline) {
      state.value = loading()
      try {
        timeline = await fetchWindTimeline()
        windError.value = null
      } catch (e) {
        if (gen !== generation) return
        windError.value = e instanceof Error ? e.message : String(e)
        state.value = failure(e)
        return
      }
      if (gen !== generation) return
    }

    const match = windForTime(timeline, frame.time)
    if (!match) {
      // Outside the wind forecast window — an honest empty state, not an
      // error and not a wave field built from some other hour's wind.
      wind.value = null
      bucket.value = null
      state.value = empty()
      return
    }
    wind.value = match.wind
    windOffsetHours.value = match.offsetHours

    const b = snapToBucket(match.wind.speedMs, match.wind.dirDeg)
    const cached = peekWaveGrid(b)
    if (cached) {
      bucket.value = b
      substituted.value = false
      state.value = success(cached, true)
      void fetchWaveGrid(b) // registers the hit in shared stats; no network
    } else {
      state.value = loading()
      try {
        const result = await fetchWaveGrid(b)
        if (gen !== generation) return
        bucket.value = result.bucket
        substituted.value = result.substituted
        state.value = success(result.grid)
      } catch (e) {
        if (gen !== generation) return
        state.value = failure(e)
      }
    }

    if (disposed) return
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      const i = time.selectedIndex.value
      prefetchBuckets([i + 1, i - 1, i + 2, i - 2, i + 3, i - 3])
    }, 350)
  }

  watch(time.selectedFrame, () => void load(), { immediate: true })

  // Playback: warm the whole window's distinct buckets up front so every
  // tick lands on a cached grid.
  watch(time.playing, (isPlaying) => {
    if (!isPlaying) return
    const end = time.playTargetIndex.value
    if (end === null) return
    const indices: number[] = []
    for (let i = time.selectedIndex.value + 1; i <= end; i++) indices.push(i)
    prefetchBuckets(indices)
  })

  void time.ensureManifest()

  return {
    ...time,
    state,
    wind,
    windOffsetHours,
    bucket,
    substituted,
    windError,
    /** Flat calm — the model reports no waves anywhere (see waveHeight.ts). */
    isCalm: computed(() => bucket.value?.ws === WS_RANGE.min),
  }
}
