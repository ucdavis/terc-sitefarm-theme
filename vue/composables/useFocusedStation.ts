import { ref, watch } from 'vue'
import {
  fetchHomewood,
  fetchNasaBuoy,
  fetchNearshoreRange,
  readStoredBuoy,
  readStoredHomewood,
  readStoredNearshore,
  type NasaBuoyRecord,
  type NearshoreSeries,
} from '../data/stationData'
import { loadWithLastKnown } from '../core/lastKnown'
import { type RequestState, idle, loading } from '../core/requestState'
import { useConditionsState } from './useConditionsState'

/**
 * Loads the map-focused station's recent data (TERC-21).
 *
 * Uses the same window (and therefore the same cache keys) as the overview
 * map badges, so clicking a marker is normally served entirely from cache —
 * the badge you clicked was drawn from the very same response.
 */
export function useFocusedStation(daysBack = 2) {
  const { focusedStation } = useConditionsState()
  const nearshoreState = ref<RequestState<NearshoreSeries>>(idle())
  const buoyState = ref<RequestState<NasaBuoyRecord[]>>(idle())

  // Clicking two markers quickly must not let the first station's slower
  // response overwrite the second's state — only the newest load commits
  // (PR review finding, same guard as the Water Quality view).
  let loadGen = 0

  async function load() {
    const gen = ++loadGen
    const f = focusedStation.value
    nearshoreState.value = idle()
    buoyState.value = idle()
    if (!f) return

    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - daysBack)

    // The badge the visitor clicked may already be showing a remembered
    // reading; the card must not fall back to a skeleton while the live
    // request is queued (TERC-70).
    const current = () => gen === loadGen
    if (f.kind === 'buoy') {
      buoyState.value = loading()
      await loadWithLastKnown<NasaBuoyRecord[]>({
        stored: readStoredBuoy(f.sourceId),
        live: fetchNasaBuoy(f.sourceId, start, end, { priority: 'high' }),
        hasData: (r) => r.length > 0,
        set: (state) => {
          buoyState.value = state
        },
        current,
      })
      return
    }

    nearshoreState.value = loading()
    await loadWithLastKnown<NearshoreSeries>({
      stored: f.kind === 'homewood' ? readStoredHomewood() : readStoredNearshore(f.sourceId),
      live:
        f.kind === 'homewood'
          ? fetchHomewood(start, end, { priority: 'high' })
          : fetchNearshoreRange(f.sourceId, start, end, { priority: 'high' }),
      hasData: (s) => s.records.length > 0,
      set: (state) => {
        nearshoreState.value = state
      },
      current,
    })
  }

  watch(focusedStation, load, { immediate: true })

  return { focusedStation, nearshoreState, buoyState }
}
