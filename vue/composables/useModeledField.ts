import { ref, watch } from 'vue'
import { gridCache } from '../core/cache'
import { type RequestState, failure, idle, loading, success } from '../core/requestState'
import {
  fetchGrid,
  gridKey,
  prefetchAdjacentFrames,
  type GridVariable,
  type ModelFrame,
  type ScalarGrid,
} from '../data/modeledGrid'
import { useModelTime } from './useModelTime'

/**
 * Drives a Forecasted Conditions scalar-field view (temperature or
 * currents) — TERC-22; the views themselves arrive with TERC-23/25.
 *
 * The cache-first contract that makes hour-stepping instant:
 *  1. On frame change, peek the cache synchronously. A hit renders in the
 *     same tick — no loading state, no flash, no network.
 *  2. Only a genuine miss shows the loading state and fetches (guarded by
 *     a generation token: fast stepping must not let a stale grid land).
 *  3. After the view settles (350 ms without another step), adjacent
 *     frames are prefetched in the background so the NEXT steps hit too.
 */
export function useModeledField(variable: GridVariable) {
  const time = useModelTime()
  const state = ref<RequestState<ScalarGrid>>(idle())
  let generation = 0
  let settleTimer: ReturnType<typeof setTimeout> | null = null

  async function loadFrame(frame: ModelFrame) {
    const gen = ++generation
    const cached = gridCache.peek<ScalarGrid>(gridKey(variable, frame))
    if (cached) {
      state.value = success(cached, true)
      // Register the hit in the shared counters without refetching.
      void fetchGrid(variable, frame)
    } else {
      state.value = loading()
      try {
        const grid = await fetchGrid(variable, frame)
        if (gen === generation) state.value = success(grid)
      } catch (e) {
        if (gen === generation) state.value = failure(e)
      }
    }

    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      prefetchAdjacentFrames(variable, time.frames.value, time.selectedIndex.value)
    }, 350)
  }

  watch(
    time.selectedFrame,
    (frame) => {
      if (frame) void loadFrame(frame)
    },
    { immediate: true },
  )

  // When "next 24 h" playback starts, prefetch the ENTIRE window up front so
  // every animation tick lands on a cached grid — no mid-animation flashes.
  watch(time.playing, (isPlaying) => {
    if (!isPlaying) return
    const end = time.playTargetIndex.value
    if (end === null) return
    for (let i = time.selectedIndex.value + 1; i <= end; i++) {
      const frame = time.frames.value[i]
      if (!frame || gridCache.has(gridKey(variable, frame))) continue
      fetchGrid(variable, frame, { prefetch: true }).catch(() => {})
    }
  })

  void time.ensureManifest()

  return { ...time, state }
}
