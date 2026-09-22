import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import { type RequestState, failure, idle, loading, success } from '../core/requestState'
import type { ScalarGrid } from '../data/gridDecode'
import { TTL } from '../core/cache'
import type { HourlyWind } from '../data/noaa'
import {
  fetchWaveGrid,
  peekWaveGrid,
  snapToBucket,
  WS_RANGE,
  type WaveBucket,
} from '../data/waveHeight'
import { useWaveTime, type WaveFrame } from './useWaveTime'

/**
 * Drives the Wave Height view (TERC-24): selected hour → NOAA wind →
 * nearest precomputed STWAVE bucket → grid.
 *
 * Since TERC-93 the hours come from the wave view's OWN axis (useWaveTime),
 * built from the hours NOAA's wind forecast covers, so every hour offered
 * already carries its wind. Before, it stepped through TERC's model frames
 * and looked each one up in NOAA's timeline — and went blank for every hour
 * once the model stopped publishing while NOAA's forecast ran on.
 *
 * Many hours share a bucket, so prefetch resolves upcoming hours to their
 * buckets first and fetches only the DISTINCT ones — a stable wind day
 * animates on one or two downloads.
 */
export function useWaveField() {
  const time = useWaveTime()
  const state = ref<RequestState<ScalarGrid>>(idle())
  const wind = ref<HourlyWind | null>(null)
  const bucket = ref<WaveBucket | null>(null)
  /** A neighbouring bucket stood in because the exact one was missing. */
  const substituted = ref(false)
  let generation = 0
  let settleTimer: ReturnType<typeof setTimeout> | null = null
  let refreshTimer: ReturnType<typeof setInterval> | null = null
  let disposed = false

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      generation++
      if (settleTimer) clearTimeout(settleTimer)
      if (refreshTimer) clearInterval(refreshTimer)
    })
  }

  const bucketFor = (f: WaveFrame): WaveBucket => snapToBucket(f.wind.speedMs, f.wind.dirDeg)

  /** Warm the DISTINCT buckets a set of frame indices resolves to. */
  function prefetchBuckets(indices: number[]) {
    const seen = new Set<string>()
    for (const i of indices) {
      const frame = time.frames.value[i]
      if (!frame) continue
      const b = bucketFor(frame)
      const key = `${b.ws}:${b.wd}`
      if (seen.has(key)) continue
      seen.add(key)
      if (!peekWaveGrid(b)) void fetchWaveGrid(b).catch(() => {})
    }
  }

  async function load() {
    const frame = time.selectedFrame.value
    if (!frame) {
      // No hours yet: NOAA is still loading, or failed (an honest error the
      // view shows, distinct from a quiet empty map).
      state.value = time.error.value ? failure(new Error(time.error.value)) : loading()
      wind.value = null
      bucket.value = null
      return
    }
    const gen = ++generation
    wind.value = frame.wind
    const b = bucketFor(frame)
    const cached = peekWaveGrid(b)
    if (cached) {
      // peek honours a remembered substitution, so a neighbour's waves are
      // never passed off as the requested solution.
      bucket.value = cached.bucket
      substituted.value = cached.substituted
      state.value = success(cached.grid, true)
      void fetchWaveGrid(b) // registers the hit in shared stats; no network
    } else {
      // Clear before loading: these describe the PREVIOUS frame, and the
      // chrome renders during loading and errors — a stale calm note or
      // substitution caveat would otherwise sit beside the new wind.
      bucket.value = null
      substituted.value = false
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
  // Re-render the error once NOAA's first attempt settles with no hours.
  watch(time.error, () => {
    if (!time.selectedFrame.value) void load()
  })

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

  // Load NOAA's hours now, and refresh them while the view stays open so a
  // kiosk never serves this morning's forecast all day. Cached for TTL.SHORT,
  // so each tick is free unless NOAA has published since.
  void time.ensureWaveHours()
  if (!disposed && getCurrentScope()) {
    refreshTimer = setInterval(() => void time.ensureWaveHours(), TTL.SHORT)
  }

  return {
    ...time,
    state,
    wind,
    bucket,
    substituted,
    /** NOAA's forecast itself failed — distinct from an ordinary empty map. */
    windError: time.error,
    /** Flat calm — the model reports no waves anywhere (see waveHeight.ts). */
    isCalm: computed(() => bucket.value?.ws === WS_RANGE.min),
  }
}
