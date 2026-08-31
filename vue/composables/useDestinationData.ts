import { computed, ref, watch, type Ref } from 'vue'
import type { DestinationDef } from '../config/destinations'
import {
  fetchHomewood,
  fetchNasaBuoy,
  fetchNearshoreRange,
  peekNearshoreRange,
  type NasaBuoyRecord,
  type NearshoreSeries,
} from '../data/stationData'
import { type RequestState, empty, failure, loading, success } from '../core/requestState'
import { useConditionsState } from './useConditionsState'

export interface StationSlot {
  stationId: number
  configName: string
  state: RequestState<NearshoreSeries>
}

export interface BuoySlot {
  buoyId: number
  name: string
  state: RequestState<NasaBuoyRecord[]>
}

/**
 * Loads ns-station-range for every station of a destination over a window
 * (TERC-21). One response per station powers BOTH the Water Quality view
 * and the coming Plan Your Day view — the shared cache means the second
 * consumer issues zero new requests. Uses the same 2-day default window as
 * the lake overview, so on a page with the map the responses are usually
 * already cached before any view asks.
 *
 * Empty responses are a normal state ('empty'), never an error, and one
 * failing station never breaks the others.
 */
export function useDestinationData(
  destination: Ref<DestinationDef | null>,
  daysBack: Ref<number> = ref(2),
) {
  const { registry } = useConditionsState()
  const slots = ref<StationSlot[]>([])
  const buoySlots = ref<BuoySlot[]>([])
  const homewoodState = ref<RequestState<NearshoreSeries>>(empty())

  function registryName(kind: 'nearshore' | 'buoy', id: number): string | null {
    return (
      registry.value.stations.find((s) => s.kind === kind && s.sourceId === id)?.name ?? null
    )
  }

  function timeWindow(): { start: Date; end: Date } {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - daysBack.value)
    return { start, end }
  }

  async function loadSlot(slot: StationSlot, start: Date, end: Date) {
    const cached = peekNearshoreRange(slot.stationId, start, end)
    if (cached) {
      slot.state = cached.records.length ? success(cached, true) : empty()
      if (cached.records.length) {
        // Still refresh counters/UX via the cache (counts as a hit, no fetch).
        void fetchNearshoreRange(slot.stationId, start, end)
      }
      return
    }
    slot.state = loading()
    try {
      const series = await fetchNearshoreRange(slot.stationId, start, end)
      slot.state = series.records.length ? success(series) : empty()
    } catch (e) {
      slot.state = failure(e)
    }
  }

  async function loadBuoys(dest: DestinationDef, start: Date, end: Date) {
    buoySlots.value = (dest.buoyIds ?? []).map((id) => ({
      buoyId: id,
      name: registryName('buoy', id) ?? `NASA Buoy ${id}`,
      state: loading(),
    }))
    await Promise.all(
      buoySlots.value.map(async (slot) => {
        try {
          const records = await fetchNasaBuoy(slot.buoyId, start, end)
          slot.state = records.length ? success(records) : empty()
        } catch (e) {
          slot.state = failure(e)
        }
      }),
    )
  }

  async function load() {
    const dest = destination.value
    if (!dest) {
      slots.value = []
      buoySlots.value = []
      homewoodState.value = empty()
      return
    }
    const { start, end } = timeWindow()
    void loadBuoys(dest, start, end)
    slots.value = dest.stationIds.map((id) => ({
      stationId: id,
      configName: registryName('nearshore', id) ?? `Station ${id}`,
      state: loading(),
    }))
    void Promise.all(slots.value.map((slot) => loadSlot(slot, start, end)))

    if (dest.includesHomewood) {
      homewoodState.value = loading()
      try {
        const series = await fetchHomewood(start, end)
        homewoodState.value = series.records.length ? success(series) : empty()
      } catch (e) {
        homewoodState.value = failure(e)
      }
    } else {
      homewoodState.value = empty()
    }
  }

  watch([() => destination.value?.id, daysBack], load, { immediate: true })

  /** Slots that actually have data, for card rendering. */
  const slotsWithData = computed(() =>
    slots.value.filter((s) => s.state.status === 'success' && s.state.data),
  )

  return { slots, slotsWithData, buoySlots, homewoodState, reload: load }
}
