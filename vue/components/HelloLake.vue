<script setup lang="ts">
/**
 * Scaffolding demo block (TERC-14/15/16). Now consumes LIVE station data
 * through the normalized station-data module — proving the full pipeline:
 * PDB block placement -> editor settings as props -> data module -> shared
 * cache -> reactive render. Replaced by real Current Conditions blocks
 * (TERC-17/18+).
 */
import { onMounted, ref } from 'vue'
import {
  fetchNearshoreRange,
  latestRecord,
  type NearshoreSeries,
} from '../data/stationData'
import { failure, idle, loading, success, type RequestState } from '../core/requestState'
import { empty as emptyState } from '../core/requestState'
import { fmt } from '../core/units'
import { cacheStats } from '../core/cache'
import { LAKE_TZ } from '../core/time'
import CacheDiagnostics from './CacheDiagnostics.vue'

const props = withDefaults(
  defineProps<{
    title?: string
    /** ns-station-range station id; PDB form values arrive as strings. */
    stationId?: number | string
    /** "Show cache diagnostics" checkbox (0/1 from the block form). */
    debug?: boolean | number | string
  }>(),
  { title: 'Lake Tahoe Conditions', stationId: 2, debug: false },
)

const showDiagnostics = props.debug === true || props.debug === 1 || props.debug === '1'
const state = ref<RequestState<NearshoreSeries>>(idle())

async function load() {
  state.value = loading()
  try {
    const end = new Date()
    const start = new Date(end.getTime() - 24 * 3600_000)
    const series = await fetchNearshoreRange(Number(props.stationId), start, end)
    state.value = series.records.length ? success(series) : emptyState()
  } catch (e) {
    state.value = failure(e)
  }
}

function latest() {
  return state.value.data ? latestRecord(state.value.data.records) : null
}

function latestTime(): string {
  const rec = latest()
  return rec
    ? rec.time.toLocaleString('en-US', { timeZone: LAKE_TZ, dateStyle: 'medium', timeStyle: 'short' })
    : ''
}

onMounted(load)
</script>

<template>
  <div class="terc-hello-lake">
    <h3>{{ title }}</h3>

    <p v-if="state.status === 'loading'">Loading station data…</p>
    <p v-else-if="state.status === 'empty'">
      No data available from station {{ stationId }} (normal — several stations are under maintenance).
    </p>
    <p v-else-if="state.status === 'error'">Could not load station data: {{ state.error }}</p>
    <template v-else-if="state.status === 'success' && state.data">
      <p class="reading">
        <strong>{{ state.data.stationName ?? `Station ${stationId}` }}</strong> —
        water {{ fmt(latest()?.waterTemp) }} °F,
        waves {{ fmt(latest()?.waveHeight, 2) }} ft
        <span class="when">as of {{ latestTime() }} (lake time)</span>
      </p>
      <p class="meta">
        {{ state.data.records.length }} records in the last 24 h ·
        cache: {{ cacheStats.hits }} hits / {{ cacheStats.misses }} misses / {{ cacheStats.joins }} joins
      </p>
    </template>

    <button type="button" @click="load">Refresh</button>
    <CacheDiagnostics v-if="showDiagnostics" />
  </div>
</template>

<style scoped>
.terc-hello-lake {
  border: 2px dashed #036;
  border-radius: 4px;
  padding: 1rem;
}
.terc-hello-lake button {
  cursor: pointer;
}
.when {
  opacity: 0.7;
  font-size: 0.85em;
}
.meta {
  font-size: 0.85em;
  opacity: 0.8;
}
</style>
