<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import StationCard from './StationCard.vue'
import LoadingState from './LoadingState.vue'
import { useConditionsState } from '../composables/useConditionsState'
import { useDestinationData } from '../composables/useDestinationData'
import type { DestinationDef } from '../config/destinations'
import { LAKE_CENTER, LAKE_DEFAULT_ZOOM } from '../config/lakeView'
import { useFocusedStation } from '../composables/useFocusedStation'
import {
  reportingDestinationNames as reportingDestinations,
  useLakeOverview,
} from '../composables/useLakeOverview'
import {
  fetchMetStation,
  latestRecord,
  readStoredMet,
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
const { nearshoreState, buoyState } = useFocusedStation()
const { markers } = useLakeOverview()

/**
 * Whole-lake view: every station the map is showing (TERC-76).
 *
 * With nothing selected this view used to render no cards at all, while the
 * map beside it showed the whole sensor network — the panel looked broken.
 * The map badges have already requested these exact URLs over this exact
 * window, so the cards join those in-flight requests instead of adding any.
 *
 * The id carries the membership because markers arrive progressively: a
 * stable id would pin the card list to whichever stations had appeared by
 * the first load.
 */
const allLakeDestination = computed<DestinationDef | null>(() => {
  const ms = markers.value
  if (!ms.length) return null
  const stationIds = ms.filter((m) => m.kind === 'nearshore').map((m) => m.sourceId)
  const buoyIds = ms.filter((m) => m.kind === 'buoy').map((m) => m.sourceId)
  return {
    id: `__all-lake:${stationIds.join(',')}|${buoyIds.join(',')}`,
    name: 'All stations',
    lat: LAKE_CENTER[0],
    lng: LAKE_CENTER[1],
    zoom: LAKE_DEFAULT_ZOOM,
    stationIds,
    buoyIds,
    includesHomewood: ms.some((m) => m.kind === 'homewood'),
  }
})
/** A chosen place is what the visitor is looking at; the lake survey is not. */
const cardDestination = computed(() => destination.value ?? allLakeDestination.value)
const cardPriority = computed<'high' | 'low'>(() => (destination.value ? 'high' : 'low'))
/** Names what the empty state is empty OF — a place, or the whole lake. */
const emptyScopeLabel = computed(() =>
  destination.value ? `for ${destination.value.name}` : 'from any station on the lake',
)
const { slots, buoySlots, homewoodState } = useDestinationData(cardDestination, ref(2), cardPriority)

/**
 * "Show more data" — always starts collapsed (TERC-73).
 *
 * The choice used to be persisted per visitor in localStorage, so anyone who
 * had ever expanded the block landed on the six-metric view on every later
 * visit. The block is meant to open on the day-planning basics and let the
 * visitor ask for the rest, so the restore was removed rather than the default
 * changed — the default was already collapsed. The old `terc-pyd-show-more`
 * key is simply no longer read; any value left in a visitor's browser is inert.
 */
const showMore = ref(false)
function toggleShowMore() {
  showMore.value = !showMore.value
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

/**
 * Cards on screen that are showing a remembered reading because their
 * refresh failed (TERC-70). Stale numbers must say so — each card already
 * carries its own timestamp, this names the reason.
 */
const staleCards = computed(() =>
  [
    ...slots.value.map((s) => s.state),
    ...buoySlots.value.map((s) => s.state),
    homewoodState.value,
    nearshoreState.value,
    buoyState.value,
  ].filter((st) => st.fromCache && st.error),
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
  /**
   * The station is reporting nothing recent, but we know what it last said
   * (TERC-76). The reading stays on screen with a note underneath rather
   * than the cards being replaced by a sentence — dropping them threw away
   * data the visitor could already see, and the swap was jarring. Honest
   * because each card carries its own timestamp and the note names the date.
   */
  | { kind: 'silent'; record: MetRecord; lastSeen: Date }
  /** Nothing at all, as far back as we looked. */
  | { kind: 'empty' }
  | { kind: 'failed'; reason: 'error' | 'timeout' }
  /** The last reading we ever fetched, shown while the live request is queued (TERC-70). */
  | { kind: 'stale'; record: MetRecord; storedAt: Date; refreshing: boolean; reason: 'error' | 'timeout' | null }
const MET_TIMEOUT_MS = 20_000
/** How far back to look for the station's last reading when the recent
 *  window is empty — in stages, since a month of readings is ~1.3 MB. */
const MET_LOOKBACK_DAYS = [7, 30]
const metState = ref<MetState>({ kind: 'loading' })
/** When the live request last succeeded — the quiet "Checked …" stamp. */
const metCheckedAt = ref<Date | null>(null)
let metGeneration = 0

async function loadMet(): Promise<void> {
  const gen = ++metGeneration
  const stale = metState.value.kind === 'stale' || metState.value.kind === 'ready' ? metState.value : null
  // Retry from a stale state keeps the reading on screen and marks it refreshing.
  metState.value =
    stale?.kind === 'stale' ? { ...stale, refreshing: true, reason: null } : { kind: 'loading' }
  const end = new Date()
  const recentStart = new Date(end)
  recentStart.setDate(recentStart.getDate() - 1)
  // The report API can take many seconds; paint the last reading we ever
  // fetched right away, dated, while the live request waits in the queue.
  // Held, not fire-and-forget: the failure path below waits for it so a
  // fast rejection can't race the disk read and drop the reading.
  const storedMet = readStoredMet().catch(() => undefined)
  void storedMet.then((stored) => {
    const last = stored ? latestRecord(stored.value) : null
    if (gen === metGeneration && metState.value.kind === 'loading' && last) {
      metState.value = { kind: 'stale', record: last, storedAt: new Date(stored!.storedAt), refreshing: true, reason: null }
    }
  })
  try {
    const recent = latestRecord(await withTimeout(fetchMetStation(recentStart, end, { priority: 'high' }), MET_TIMEOUT_MS))
    if (gen !== metGeneration) return
    metCheckedAt.value = new Date()
    if (recent) {
      metState.value = { kind: 'ready', record: recent }
      return
    }
    // Nothing in the last day: find the last time it did report, so the
    // message carries a date instead of a shrug.
    // The lookback already fetches the record itself — keep it, so the
    // cards can stay on screen instead of being replaced by a sentence
    // saying the same thing with the numbers removed.
    let lastRecord: MetRecord | null = null
    for (const days of MET_LOOKBACK_DAYS) {
      const farStart = new Date(end)
      farStart.setDate(farStart.getDate() - days)
      const older = latestRecord(await withTimeout(fetchMetStation(farStart, end, { priority: 'high' }), MET_TIMEOUT_MS))
      if (gen !== metGeneration) return
      if (older) {
        lastRecord = older
        break
      }
    }
    metState.value = lastRecord
      ? { kind: 'silent', record: lastRecord, lastSeen: lastRecord.time }
      : { kind: 'empty' }
  } catch (err) {
    if (gen !== metGeneration) return
    const reason = err instanceof TimeoutError ? 'timeout' : 'error'
    // A remembered reading beats an empty error box: keep it, say why it is
    // old. Waiting on the stored read here makes that true whichever
    // finished first.
    const stored = await storedMet
    if (gen !== metGeneration) return
    const last = stored ? latestRecord(stored.value) : null
    metState.value = last
      ? { kind: 'stale', record: last, storedAt: new Date(stored!.storedAt), refreshing: false, reason }
      : { kind: 'failed', reason }
  }
}
onMounted(loadMet)

const met = computed(() => {
  const st = metState.value
  return st.kind === 'ready' || st.kind === 'stale' || st.kind === 'silent' ? st.record : null
})
/** Quiet freshness line under the lake-weather cards (TERC-70). */
const metFreshness = computed(() => {
  const st = metState.value
  if (st.kind === 'stale') {
    const when = `${fmtLakeTime(st.storedAt)} lake time`
    if (st.refreshing) return `Showing the reading fetched ${when} · updating…`
    return st.reason === 'timeout'
      ? `Showing the reading fetched ${when} — no answer from the met station after ${MET_TIMEOUT_MS / 1000} seconds.`
      : `Showing the reading fetched ${when} — the met station request failed.`
  }
  if (st.kind === 'silent') {
    return `The USCG met station has not reported since ${fmtLakeTime(st.lastSeen)} lake time — showing its last reading.`
  }
  if (st.kind === 'ready' && metCheckedAt.value) return `Checked ${fmtLakeTime(metCheckedAt.value)} lake time`
  return null
})
const metMessage = computed(() => {
  const st = metState.value
  // A silent station keeps its cards and carries its note in metFreshness
  // instead — only a station we have never heard from falls back to prose.
  if (st.kind === 'empty') {
    return `No lake weather from the USCG met station in the last ${MET_LOOKBACK_DAYS[MET_LOOKBACK_DAYS.length - 1]} days.`
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

    <!-- TERC-76: lake weather first. It is lake-wide context and applies to
         every station below it, so it reads better before the per-station
         detail rather than stranded underneath it. -->
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
      <p
        v-if="met && metFreshness"
        class="pyd-freshness"
        :class="{ 'pyd-freshness--stale': (metState.kind === 'stale' && !metState.refreshing) || metState.kind === 'silent' }"
        role="status"
      >
        {{ metFreshness }}
        <!-- Only a failed refresh offers a retry. A silent station is not an
             error and retrying will not wake it. -->
        <button v-if="metState.kind === 'stale' && !metState.refreshing" type="button" class="pyd-retry" @click="loadMet">Try again</button>
      </p>
      <div v-else-if="metMessage" class="pyd-met-state" role="status">
        <p class="pyd-note pyd-met-msg">{{ metMessage }}</p>
        <button v-if="metState.kind === 'failed'" type="button" class="pyd-retry" @click="loadMet">Try again</button>
      </div>
      <LoadingState v-else :lines="2" />
    </section>

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

    <!-- Whole lake or a chosen destination: both render station cards
         (TERC-76). With nothing selected this used to render nothing, so the
         panel sat empty beside a map full of stations. -->
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
      <p v-if="staleCards.length" class="pyd-freshness pyd-freshness--stale" role="status">
        Showing the last readings we were able to fetch — the latest refresh
        failed. Each card is dated with the reading it shows.
      </p>
      <LoadingState v-else-if="anyLoading" :lines="3" />
      <div v-else class="pyd-panel">
        <strong>No station data available {{ emptyScopeLabel }}.</strong>
        <p>This is a normal state — several stations are under maintenance. Stations checked:</p>
        <ul class="pyd-status-list">
          <li v-for="s in slots" :key="s.stationId">
            {{ s.configName }} —
            {{ s.state.status === 'empty' ? 'no data available' : s.state.status }}
          </li>
          <li v-if="cardDestination?.includesHomewood">
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
.pyd-freshness {
  margin: 6px 0 0;
  font-size: .75rem;
  color: #5f6e77;
  display: flex;
  gap: 10px;
  align-items: baseline;
  flex-wrap: wrap;
}
.pyd-freshness--stale {
  color: #8f6614;
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
