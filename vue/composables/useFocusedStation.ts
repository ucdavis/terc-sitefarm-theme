import { ref, watch } from 'vue'
import {
  fetchHomewood,
  fetchNasaBuoy,
  fetchNearshoreRange,
  type NasaBuoyRecord,
  type NearshoreSeries,
} from '../data/stationData'
import { type RequestState, empty, failure, idle, loading, success } from '../core/requestState'
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

  async function load() {
    const f = focusedStation.value
    nearshoreState.value = idle()
    buoyState.value = idle()
    if (!f) return

    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - daysBack)

    if (f.kind === 'buoy') {
      buoyState.value = loading()
      try {
        const records = await fetchNasaBuoy(f.sourceId, start, end)
        buoyState.value = records.length ? success(records) : empty()
      } catch (e) {
        buoyState.value = failure(e)
      }
      return
    }

    nearshoreState.value = loading()
    try {
      const series =
        f.kind === 'homewood'
          ? await fetchHomewood(start, end)
          : await fetchNearshoreRange(f.sourceId, start, end)
      nearshoreState.value = series.records.length ? success(series) : empty()
    } catch (e) {
      nearshoreState.value = failure(e)
    }
  }

  watch(focusedStation, load, { immediate: true })

  return { focusedStation, nearshoreState, buoyState }
}
