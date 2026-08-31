<script setup lang="ts">
import { computed } from 'vue'
import StationCard from './StationCard.vue'
import LoadingState from './LoadingState.vue'
import { useConditionsState } from '../composables/useConditionsState'
import { useDestinationData } from '../composables/useDestinationData'
import { useFocusedStation } from '../composables/useFocusedStation'
import { latestRecord, type NearshoreRecord } from '../data/stationData'
import { isPlausible } from '../core/units'
import { assessMetric } from '../config/qualitative'

/**
 * Water Quality view (TERC-21): turbidity, conductivity, dissolved oxygen,
 * and chlorophyll for the selected destination or focused station, each
 * with a plain-language interpretation band.
 *
 * Zero additional network requests by design: these are sibling fields in
 * the ns-station-range responses the lake overview (TERC-17) already
 * fetched over the same 2-day window — the shared cache serves this view
 * from data the page downloaded for the map badges.
 *
 * Mid-lake NASA buoys don't measure these parameters; a focused buoy gets
 * an honest explanation instead of empty cards.
 */
const { destination, focusedStation, clearSelection } = useConditionsState()
const { slots, homewoodState } = useDestinationData(destination)
const { nearshoreState, buoyState } = useFocusedStation()

interface QualityRow {
  stationName: string
  time: Date
  turbidity: number | null
  conductivity: number | null
  dissolvedOxygen: number | null
  doSuspect: boolean
  chlorophyll: number | null
}

function toRow(name: string, rec: NearshoreRecord): QualityRow {
  return {
    stationName: name,
    time: rec.time,
    turbidity: rec.turbidity,
    conductivity: rec.conductivity,
    dissolvedOxygen: rec.dissolvedOxygen,
    doSuspect:
      rec.dissolvedOxygen !== null && !isPlausible('dissolvedOxygen', rec.dissolvedOxygen),
    chlorophyll: rec.chlorophyll,
  }
}

/** When a station is focused, it replaces the destination's rows entirely. */
const focusedRow = computed<QualityRow | null>(() => {
  const series = nearshoreState.value.data
  if (!series) return null
  const rec = latestRecord(series.records)
  if (!rec) return null
  return toRow(series.stationName ?? focusedStation.value?.name ?? 'Station', rec)
})

const rows = computed<QualityRow[]>(() => {
  const out = slots.value
    .filter((s) => s.state.status === 'success' && s.state.data)
    .map((s) => toRow(s.state.data!.stationName ?? s.configName, latestRecord(s.state.data!.records)!))
  // tc-homewood reports the same water-quality fields — include it when the
  // destination carries it (the prototype dropped this series).
  const hw = homewoodState.value.data
  const hwRec = hw ? latestRecord(hw.records) : null
  if (hwRec) out.push(toRow(hw!.stationName ?? 'Homewood TC', hwRec))
  return out
})

const anyLoading = computed(
  () =>
    slots.value.some((s) => s.state.status === 'loading') ||
    homewoodState.value.status === 'loading',
)
const emptyStations = computed(() =>
  slots.value.filter((s) => s.state.status === 'empty' || s.state.status === 'error'),
)

const focusedName = computed(
  () =>
    nearshoreState.value.data?.stationName ||
    focusedStation.value?.name ||
    `${focusedStation.value?.kind ?? 'station'} ${focusedStation.value?.sourceId ?? ''}`,
)
</script>

<template>
  <div class="wq">
    <p class="wq-sub">
      Turbidity, conductivity, dissolved oxygen, and chlorophyll from the same
      station responses the map already fetched — no additional requests.
    </p>

    <!-- A station clicked on the map replaces the destination view. -->
    <div v-if="focusedStation" class="wq-focus">
      <div class="wq-focus-head">
        <h4 class="wq-title">
          {{ focusedName }}
          <span v-if="focusedStation.kind === 'buoy'" class="wq-buoy-tag">mid-lake buoy</span>
        </h4>
        <button type="button" class="wq-clear" @click="clearSelection">✕ Clear station</button>
      </div>

      <div v-if="focusedStation.kind === 'buoy'" class="wq-panel">
        <strong>Mid-lake buoys don't report water-quality parameters.</strong>
        <p>
          The NASA buoys measure water and air temperature and wind. For
          turbidity, conductivity, dissolved oxygen, and chlorophyll, pick a
          near-shore station.
        </p>
      </div>
      <div v-else-if="focusedRow" class="wq-grid">
        <StationCard label="Turbidity" :value="focusedRow.turbidity" unit="NTU" :digits="2"
          :timestamp="focusedRow.time" :assessment="assessMetric('turbidity', focusedRow.turbidity)" />
        <StationCard label="Conductivity" :value="focusedRow.conductivity" unit="mS/cm" :digits="3"
          :timestamp="focusedRow.time" :assessment="assessMetric('conductivity', focusedRow.conductivity)" />
        <StationCard label="Dissolved oxygen" :value="focusedRow.dissolvedOxygen" unit="% sat" :digits="1"
          :timestamp="focusedRow.time" :suspect="focusedRow.doSuspect"
          suspect-note="Outside the plausible % saturation range (0–200) — possible sensor issue. Shown as reported."
          :assessment="assessMetric('dissolvedOxygen', focusedRow.dissolvedOxygen)" />
        <StationCard label="Chlorophyll" :value="focusedRow.chlorophyll" unit="µg/L" :digits="1"
          :timestamp="focusedRow.time" :assessment="assessMetric('chlorophyll', focusedRow.chlorophyll)" />
      </div>
      <LoadingState v-else-if="nearshoreState.status === 'loading' || buoyState.status === 'loading'" :lines="4" />
      <div v-else class="wq-panel">
        <strong>{{ focusedName }} isn't reporting right now.</strong>
        <p>The station stays on the map and will show data when it returns.</p>
      </div>
    </div>

    <div v-else-if="!destination" class="wq-panel">
      <strong>No destination selected.</strong>
      <p>
        Pick a destination above or on the map to see the latest water-quality
        readings from its stations.
      </p>
    </div>

    <template v-else>
      <LoadingState v-if="anyLoading && rows.length === 0" :lines="4" />

      <template v-for="row in rows" :key="row.stationName">
        <h4 class="wq-station-head">{{ row.stationName }}</h4>
        <div class="wq-grid">
          <StationCard label="Turbidity" :value="row.turbidity" unit="NTU" :digits="2"
            :timestamp="row.time" :assessment="assessMetric('turbidity', row.turbidity)" />
          <StationCard label="Conductivity" :value="row.conductivity" unit="mS/cm" :digits="3"
            :timestamp="row.time" :assessment="assessMetric('conductivity', row.conductivity)" />
          <StationCard label="Dissolved oxygen" :value="row.dissolvedOxygen" unit="% sat" :digits="1"
            :timestamp="row.time" :suspect="row.doSuspect"
            suspect-note="Outside the plausible % saturation range (0–200) — possible sensor issue. Shown as reported."
            :assessment="assessMetric('dissolvedOxygen', row.dissolvedOxygen)" />
          <StationCard label="Chlorophyll" :value="row.chlorophyll" unit="µg/L" :digits="1"
            :timestamp="row.time" :assessment="assessMetric('chlorophyll', row.chlorophyll)" />
        </div>
      </template>

      <div v-if="!anyLoading && rows.length === 0" class="wq-panel">
        <strong>No water-quality data for {{ destination.name }}.</strong>
        <p>All assigned stations returned empty responses (a normal state).</p>
      </div>

      <p v-if="emptyStations.length && rows.length" class="wq-empty-note">
        Not reporting: {{ emptyStations.map((s) => s.configName).join(', ') }}
      </p>
    </template>

    <p class="wq-sentinel-note">
      Readings of −9.0 are the API's "no reading" sentinel and are shown as
      "no data available", never charted or averaged. Interpretive bands
      ("Clear", "Healthy", …) are draft placeholders pending TERC science
      review.
    </p>
  </div>
</template>

<style scoped>
.wq {
  display: grid;
  gap: 0.75rem;
}
.wq-sub {
  margin: 0;
  font-size: 13px;
  color: #4a5a64;
}
.wq-title {
  font-size: 18px;
  margin: 0;
}
.wq-focus-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.wq-clear {
  font: inherit;
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 99px;
  border: 1px solid #d5dde2;
  background: #f7fafb;
  color: #4a5a64;
  cursor: pointer;
}
.wq-clear:hover {
  background: #eef2f4;
}
.wq-buoy-tag {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #24558f;
  background: #e4ecf7;
  border-radius: 99px;
  padding: 2px 8px;
  margin-left: 6px;
  vertical-align: middle;
}
.wq-station-head {
  font-size: 14px;
  color: #4a5a64;
  margin: 10px 0 0;
}
.wq-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.wq-panel {
  background: #f7fafb;
  border: 1px dashed #d5dde2;
  border-radius: 8px;
  padding: 16px 18px;
  font-size: 14px;
  color: #4a5a64;
}
.wq-panel p {
  margin: 6px 0 0;
}
.wq-empty-note {
  margin: 4px 0 0;
  font-size: 13px;
  color: #7a8a92;
}
.wq-sentinel-note {
  margin: 4px 0 0;
  font-size: 12px;
  color: #7a8a92;
  border-top: 1px solid #d5dde2;
  padding-top: 10px;
}
</style>
