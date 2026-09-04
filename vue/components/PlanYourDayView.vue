<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import StationCard from './StationCard.vue'
import LoadingState from './LoadingState.vue'
import { useConditionsState } from '../composables/useConditionsState'
import { useDestinationData } from '../composables/useDestinationData'
import { useFocusedStation } from '../composables/useFocusedStation'
import {
  reportingDestinationNames as reportingDestinations,
  useLakeOverview,
} from '../composables/useLakeOverview'
import {
  fetchMetStation,
  latestRecord,
  type MetRecord,
  type NearshoreRecord,
} from '../data/stationData'
import { fmtLakeTime } from '../core/time'
import { TimeoutError, withTimeout } from '../core/timeout'
import { isPlausible } from '../core/units'
import { assessMetric, COLD_WATER_SHOCK_NOTE } from '../config/qualitative'

/**
 * Plan Your Day view (TERC-58): at-a-glance station condition cards for the
 * selected destination or focused station, following the prototype's card
 * pattern. Demo decisions applied:
 *  - DEFAULT metrics are water temperature, wave height, and turbidity;
 *  - a "show more data" toggle reveals the rest (conductivity, dissolved
 *    oxygen, chlorophyll) — this absorbed the prototype's separate
 *    "Plan Your Day +" view;
 *  - the cold-water-shock note is always present.
 *
 * The cards read the same cached 2-day station responses the lake map
 *  already fetched — zero additional requests for card data. The one extra
 * fetch on this view is the USCG met station (lake weather context), which
 * nothing else loads.
 */
const { destination, focusedStation, clearSelection, registry } = useConditionsState()
const { slots, buoySlots, homewoodState } = useDestinationData(destination)
const { nearshoreState, buoyState } = useFocusedStation()
const { markers } = useLakeOverview()

/** "Show more data" — persisted per visitor; storage can be unavailable. */
const SHOW_MORE_KEY = 'terc-pyd-show-more'
const showMore = ref(false)
try {
  showMore.value = localStorage.getItem(SHOW_MORE_KEY) === '1'
} catch {
  /* private windows / blocked storage: default collapsed */
}
function toggleShowMore() {
  showMore.value = !showMore.value
  try {
    localStorage.setItem(SHOW_MORE_KEY, showMore.value ? '1' : '0')
  } catch {
    /* non-persistent is fine */
  }
}

interface CardMetric {
  label: string
  key: keyof NearshoreRecord & keyof typeof METRIC_QUALITY
  unit: string
  digits: number
  extra: boolean
}
const METRIC_QUALITY = {
  waterTemp: 'waterTemp',
  waveHeight: 'waveHeight',
  turbidity: 'turbidity',
  conductivity: 'conductivity',
  dissolvedOxygen: 'dissolvedOxygen',
  chlorophyll: 'chlorophyll',
} as const
/** Demo decision: temp / wave / turbidity by default; the rest behind the toggle. */
const NEARSHORE_METRICS: CardMetric[] = [
  { label: 'Water temperature', key: 'waterTemp', unit: '°F', digits: 1, extra: false },
  { label: 'Wave height', key: 'waveHeight', unit: 'ft', digits: 2, extra: false },
  { label: 'Turbidity', key: 'turbidity', unit: 'NTU', digits: 2, extra: false },
  { label: 'Conductivity', key: 'conductivity', unit: 'mS/cm', digits: 3, extra: true },
  { label: 'Dissolved oxygen', key: 'dissolvedOxygen', unit: '% sat', digits: 1, extra: true },
  { label: 'Chlorophyll', key: 'chlorophyll', unit: 'µg/L', digits: 1, extra: true },
]
const visibleMetrics = computed(() =>
  NEARSHORE_METRICS.filter((m) => !m.extra || showMore.value),
)

function suspectDO(rec: NearshoreRecord, key: string): boolean {
  return (
    key === 'dissolvedOxygen' &&
    rec.dissolvedOxygen !== null &&
    !isPlausible('dissolvedOxygen', rec.dissolvedOxygen)
  )
}

/** Registry (editor-owned) names win; API names cover unknown stations. */
function registryStationName(kind: 'nearshore' | 'homewood', id: number, apiName: string | null, fallback: string): string {
  const hit = registry.value.stations.find(
    (r) => r.kind === kind && (kind === 'homewood' || r.sourceId === id),
  )?.name
  return hit || apiName || fallback
}

/** Reporting near-shore stations of the destination (+ tc-homewood). */
const reportingStations = computed(() => {
  const out = slots.value
    .filter((s) => s.state.status === 'success' && s.state.data)
    .map((s) => ({
      name: registryStationName('nearshore', s.stationId, s.state.data!.stationName, s.configName),
      rec: latestRecord(s.state.data!.records),
    }))
    .filter((x): x is { name: string; rec: NearshoreRecord } => x.rec !== null)
  const hw = homewoodState.value.data
  const hwRec = hw ? latestRecord(hw.records) : null
  if (hwRec) out.push({ name: registryStationName('homewood', -1, hw!.stationName, 'Homewood TC'), rec: hwRec })
  return out
})

const reportingBuoys = computed(() =>
  buoySlots.value
    .filter((s) => s.state.status === 'success' && s.state.data)
    .map((s) => ({ name: s.name, rec: latestRecord(s.state.data!) }))
    .filter((x): x is { name: string; rec: NonNullable<typeof x.rec> } => x.rec !== null),
)

const anyLoading = computed(
  () =>
    slots.value.some((s) => s.state.status === 'loading') ||
    buoySlots.value.some((s) => s.state.status === 'loading') ||
    homewoodState.value.status === 'loading',
)

/** Focused-station data (station click on the map takes precedence). */
const focusedNearshoreRec = computed(() =>
  nearshoreState.value.data ? latestRecord(nearshoreState.value.data.records) : null,
)
const focusedBuoyRec = computed(() =>
  buoyState.value.data ? latestRecord(buoyState.value.data) : null,
)
const focusedName = computed(() => {
  const f = focusedStation.value
  if (!f) return ''
  return f.name || `${f.kind} station ${f.sourceId}`
})

/** Destinations reporting right now — derived from the live markers
 *  (shared helper; the shell's welcome uses the same one). */
const reportingDestinationNames = computed(() =>
  reportingDestinations(markers.value, registry.value.destinations),
)

/**
 * Lake weather: the USCG met station — the one fetch unique to this view.
 * Four honest outcomes (TERC-62), never an endless skeleton: a reading;
 * an empty window (the station has been silent — say since when); a
 * failed request; or no answer inside the timeout. Empty is normal data
 * (the station goes dark for maintenance), failure is a data problem.
 */
type MetState =
  | { kind: 'loading' }
  | { kind: 'ready'; record: MetRecord }
  | { kind: 'empty'; lastSeen: Date | null }
  | { kind: 'failed'; reason: 'error' | 'timeout' }
const MET_TIMEOUT_MS = 20_000
/** How far back to look for the station's last reading when the recent
 *  window is empty — in stages, since a month of readings is ~1.3 MB. */
const MET_LOOKBACK_DAYS = [7, 30]
const metState = ref<MetState>({ kind: 'loading' })
let metGeneration = 0

async function loadMet(): Promise<void> {
  const gen = ++metGeneration
  metState.value = { kind: 'loading' }
  const end = new Date()
  const recentStart = new Date(end)
  recentStart.setDate(recentStart.getDate() - 1)
  try {
    const recent = latestRecord(await withTimeout(fetchMetStation(recentStart, end), MET_TIMEOUT_MS))
    if (gen !== metGeneration) return
    if (recent) {
      metState.value = { kind: 'ready', record: recent }
      return
    }
    // Nothing in the last day: find the last time it did report, so the
    // message carries a date instead of a shrug.
    let lastSeen: Date | null = null
    for (const days of MET_LOOKBACK_DAYS) {
      const farStart = new Date(end)
      farStart.setDate(farStart.getDate() - days)
      const older = latestRecord(await withTimeout(fetchMetStation(farStart, end), MET_TIMEOUT_MS))
      if (gen !== metGeneration) return
      if (older) {
        lastSeen = older.time
        break
      }
    }
    metState.value = { kind: 'empty', lastSeen }
  } catch (err) {
    if (gen !== metGeneration) return
    metState.value = { kind: 'failed', reason: err instanceof TimeoutError ? 'timeout' : 'error' }
  }
}
onMounted(loadMet)

const met = computed(() => (metState.value.kind === 'ready' ? metState.value.record : null))
const metMessage = computed(() => {
  const st = metState.value
  if (st.kind === 'empty') {
    return st.lastSeen
      ? `No lake weather in the last 24 hours — the USCG met station last reported ${fmtLakeTime(st.lastSeen)} lake time.`
      : `No lake weather from the USCG met station in the last ${MET_LOOKBACK_DAYS[MET_LOOKBACK_DAYS.length - 1]} days.`
  }
  if (st.kind === 'failed') {
    return st.reason === 'timeout'
      ? `Lake weather is taking too long to load — no answer from the met station after ${MET_TIMEOUT_MS / 1000} seconds.`
      : 'Lake weather is temporarily unavailable (met station request failed).'
  }
  return null
})
</script>

<template>
  <div class="pyd">
    <div class="pyd-toolbar">
      <button
        type="button"
        class="pyd-toggle"
        :aria-expanded="showMore"
        @click="toggleShowMore"
      >
        {{ showMore ? 'Show less' : 'Show more data' }}
      </button>
      <span class="pyd-toggle-hint">
        {{ showMore ? 'All six water metrics per station.' : 'Water temp, waves, and clarity — the day-planning basics.' }}
      </span>
    </div>

    <p class="pyd-cold-note">{{ COLD_WATER_SHOCK_NOTE }}</p>

    <!-- A single station clicked on the map takes precedence over areas. -->
    <div v-if="focusedStation" class="pyd-focus">
      <div class="pyd-focus-head">
        <h4 class="pyd-title">
          {{ focusedName }}
          <span v-if="focusedStation.kind === 'buoy'" class="pyd-buoy-tag">mid-lake buoy</span>
        </h4>
        <button type="button" class="pyd-clear" @click="clearSelection">✕ Clear station</button>
      </div>

      <div v-if="focusedNearshoreRec" class="pyd-grid">
        <StationCard
          v-for="m in visibleMetrics"
          :key="m.key"
          :label="m.label"
          :value="focusedNearshoreRec[m.key] as number | null"
          :unit="m.unit"
          :digits="m.digits"
          :timestamp="focusedNearshoreRec.time"
          :suspect="suspectDO(focusedNearshoreRec, m.key)"
          suspect-note="Outside the plausible % saturation range (0–200) — possible sensor issue. Shown as reported."
          :assessment="suspectDO(focusedNearshoreRec, m.key) ? null : assessMetric(METRIC_QUALITY[m.key], focusedNearshoreRec[m.key] as number | null)"
        />
      </div>
      <template v-else-if="focusedBuoyRec">
        <div class="pyd-grid">
          <StationCard label="Water temperature" :value="focusedBuoyRec.waterTemp" unit="°F"
            :timestamp="focusedBuoyRec.time" :assessment="assessMetric('waterTemp', focusedBuoyRec.waterTemp)" />
          <StationCard label="Air temperature" :value="focusedBuoyRec.airTemp" unit="°F"
            :timestamp="focusedBuoyRec.time" :assessment="assessMetric('airTemp', focusedBuoyRec.airTemp)" />
          <StationCard label="Wind" :value="focusedBuoyRec.windSpeed" unit="mph"
            :timestamp="focusedBuoyRec.time" :assessment="assessMetric('windSpeed', focusedBuoyRec.windSpeed)" />
        </div>
        <p v-if="showMore" class="pyd-note">
          Mid-lake buoys don't carry turbidity, conductivity, dissolved-oxygen,
          or chlorophyll sensors — near-shore stations report those.
        </p>
      </template>
      <LoadingState
        v-else-if="nearshoreState.status === 'loading' || buoyState.status === 'loading'"
        :lines="2"
      />
      <div v-else class="pyd-panel">
        <strong>{{ focusedName }} isn't reporting right now.</strong>
        <p>The station stays on the map — several are under maintenance and are expected to return.</p>
      </div>
    </div>

    <!-- Whole lake, nothing selected: the welcome now sits beside the map in
         the shell (TERC-9 follow-up); this view has nothing to add. -->
    <template v-else-if="!destination" />

    <template v-else>
      <template v-if="reportingStations.length || reportingBuoys.length">
        <template v-for="st in reportingStations" :key="st.name">
          <h4 class="pyd-station-head">{{ st.name }}</h4>
          <div class="pyd-grid">
            <StationCard
              v-for="m in visibleMetrics"
              :key="m.key"
              :label="m.label"
              :value="st.rec[m.key] as number | null"
              :unit="m.unit"
              :digits="m.digits"
              :timestamp="st.rec.time"
              :suspect="suspectDO(st.rec, m.key)"
              suspect-note="Outside the plausible % saturation range (0–200) — possible sensor issue. Shown as reported."
              :assessment="suspectDO(st.rec, m.key) ? null : assessMetric(METRIC_QUALITY[m.key], st.rec[m.key] as number | null)"
            />
          </div>
        </template>
        <template v-for="b in reportingBuoys" :key="b.name">
          <h4 class="pyd-station-head">{{ b.name }} <span class="pyd-buoy-tag">mid-lake buoy</span></h4>
          <div class="pyd-grid">
            <StationCard label="Water temperature" :value="b.rec.waterTemp" unit="°F"
              :timestamp="b.rec.time" :assessment="assessMetric('waterTemp', b.rec.waterTemp)" />
            <StationCard label="Air temperature" :value="b.rec.airTemp" unit="°F"
              :timestamp="b.rec.time" :assessment="assessMetric('airTemp', b.rec.airTemp)" />
            <StationCard label="Wind" :value="b.rec.windSpeed" unit="mph"
              :timestamp="b.rec.time" :assessment="assessMetric('windSpeed', b.rec.windSpeed)" />
          </div>
        </template>
      </template>
      <LoadingState v-else-if="anyLoading" :lines="3" />
      <div v-else class="pyd-panel">
        <strong>No station data available for {{ destination.name }}.</strong>
        <p>This is a normal state — several stations are under maintenance. Stations checked:</p>
        <ul class="pyd-status-list">
          <li v-for="s in slots" :key="s.stationId">
            {{ s.configName }} —
            {{ s.state.status === 'empty' ? 'no data available' : s.state.status }}
          </li>
          <li v-if="destination.includesHomewood">
            Homewood TC —
            {{ homewoodState.status === 'empty' ? 'no data available' : homewoodState.status }}
          </li>
        </ul>
        <p v-if="reportingDestinationNames.length" class="pyd-hint">
          Destinations with reporting stations right now:
          {{ reportingDestinationNames.join(', ') }}.
        </p>
      </div>
    </template>

    <section class="pyd-met">
      <h4 class="pyd-station-head">Lake weather <span class="pyd-met-src">USCG met station</span></h4>
      <div v-if="met" class="pyd-grid">
        <StationCard
          label="Air temperature"
          :value="met.airTemp"
          unit="°F"
          :timestamp="met.time"
          :suspect="met.airTemp !== null && !isPlausible('airTempC', ((met.airTemp - 32) * 5) / 9)"
          :assessment="assessMetric('airTemp', met.airTemp)"
        />
        <StationCard label="Wind" :value="met.windSpeed" unit="mph"
          :timestamp="met.time" :assessment="assessMetric('windSpeed', met.windSpeed)" />
      </div>
      <div v-else-if="metMessage" class="pyd-met-state" role="status">
        <p class="pyd-note pyd-met-msg">{{ metMessage }}</p>
        <button v-if="metState.kind === 'failed'" type="button" class="pyd-retry" @click="loadMet">Try again</button>
      </div>
      <LoadingState v-else :lines="2" />
    </section>
  </div>
</template>

<style scoped>
.pyd {
  display: grid;
  gap: 0.8rem;
}
.pyd-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.pyd-toggle {
  font: inherit;
  font-size: .8125rem;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 99px;
  border: 1px solid #1c6b45;
  background: #fff;
  color: #1c6b45;
  cursor: pointer;
}
.pyd-toggle[aria-expanded='true'] {
  background: #1c6b45;
  color: #fff;
}
.pyd-toggle:focus-visible,
.pyd-clear:focus-visible {
  outline: 3px solid #f0b323;
  outline-offset: 2px;
}
.pyd-toggle-hint {
  font-size: .8125rem;
  color: #4a5a64;
}
.pyd-cold-note {
  margin: 0;
  font-size: .8125rem;
  line-height: 1.45;
  color: #8c4f17;
  background: #fdf3e0;
  border-radius: 4px;
  padding: 6px 8px;
}
.pyd-focus-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.pyd-title {
  font-size: 1.125rem;
  margin: 0;
}
.pyd-clear {
  font: inherit;
  font-size: .8125rem;
  padding: 5px 12px;
  border-radius: 99px;
  border: 1px solid #d5dde2;
  background: #f7fafb;
  color: #4a5a64;
  cursor: pointer;
}
.pyd-clear:hover {
  background: #eef2f4;
}
.pyd-buoy-tag {
  font-size: .625rem;
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
.pyd-station-head {
  font-size: .875rem;
  color: #4a5a64;
  margin: 8px 0 0;
}
.pyd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 6px;
}
.pyd-panel {
  background: #f7fafb;
  border: 1px dashed #d5dde2;
  border-radius: 8px;
  padding: 16px 18px;
  font-size: .875rem;
  color: #4a5a64;
}
.pyd-panel p {
  margin: 6px 0 0;
}
.pyd-hint {
  font-size: .8125rem;
  color: #5f6e77;
}
.pyd-status-list {
  margin: 6px 0 0;
  padding-left: 1.1rem;
}
.pyd-status-list li {
  margin-top: 3px;
}
.pyd-note {
  margin: 6px 0 0;
  font-size: .8125rem;
  color: #5f6e77;
}
.pyd-met {
  border-top: 1px solid #d5dde2;
  padding-top: 8px;
}
.pyd-met-state {
  display: flex;
  gap: 10px;
  align-items: baseline;
  flex-wrap: wrap;
}
.pyd-met-msg {
  margin: 0;
}
.pyd-retry {
  font: inherit;
  font-size: .8125rem;
  font-weight: 600;
  padding: 3px 12px;
  border-radius: 99px;
  border: 1px solid #1c6b45;
  background: #fff;
  color: #1c6b45;
  cursor: pointer;
}
.pyd-retry:hover {
  background: #eef4f6;
}
.pyd-retry:focus-visible {
  outline: 3px solid #f0b323;
  outline-offset: 2px;
}
.pyd-met-src {
  font-size: .625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #4a5a64;
  background: #f0f3f5;
  border: 1px solid #d5dde2;
  border-radius: 99px;
  padding: 2px 8px;
  margin-left: 6px;
  vertical-align: middle;
}
</style>
