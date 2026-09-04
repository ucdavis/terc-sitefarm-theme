<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import TimeSeriesChart, { type ChartSeries } from './TimeSeriesChart.vue'
import LoadingState from './LoadingState.vue'
import { bandChipStyle } from '../config/brandPalette'
import { useConditionsState } from '../composables/useConditionsState'
import {
  assessMetric,
  COLD_WATER_SHOCK_NOTE,
  type QualityAssessment,
  type QualityMetric,
} from '../config/qualitative'
import {
  fetchHomewood,
  fetchNasaBuoy,
  fetchNearshoreRange,
  type NasaBuoyRecord,
  type NearshoreRecord,
  type NearshoreSeries,
} from '../data/stationData'
import { isPlausible } from '../core/units'

/**
 * Water Quality view (TERC-21), charts edition per the demo decisions:
 * overlapping multi-station time charts for ALL six parameters — water
 * temperature, wave height, turbidity, conductivity, dissolved oxygen,
 * chlorophyll — tied to the shell's selected destination or focused
 * station, with combined all-station charts when nothing is selected.
 * No tiles (the former Climate Impacts charts folded in here; tiles move
 * to Plan Your Day).
 *
 * Request economics: ONE fetch per station per range window (near-shore
 * sweep + tc-homewood + the NASA buoys for the temperature overlay).
 * Every selection change — destination, station focus, whole lake — is a
 * pure in-memory filter over those responses: zero new requests.
 *
 * Each chart's footer interprets every station's latest reading through
 * the condition bands (chips + a consensus sentence). The water-temperature
 * chart always carries the cold-water-shock note, whatever the band says.
 */
const RANGES = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
]
const days = ref(7)
const loadingCount = ref(0)
const series = ref<NearshoreSeries[]>([]) // reporting near-shore + tc-homewood (-1)
const buoySeries = ref<{ id: number; name: string; records: NasaBuoyRecord[] }[]>([])
/** Stations whose fetch FAILED this load — an outage is not "not reporting". */
const failedSources = ref<string[]>([])

const { destination, focusedStation, clearSelection, registry } = useConditionsState()

const SERIES_COLORS = ['#0e6ba8', '#1c8c62', '#c96a1f', '#7a4fa3', '#a8385f', '#4a6b7c']
const BUOY_COLORS = ['#14475e', '#3b6f8a', '#6293ad', '#8ab6cf']

/** Guards against overlapping loads: only the newest invocation commits. */
let loadGen = 0

async function load() {
  const gen = ++loadGen
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days.value)
  loadingCount.value++
  const failed: string[] = []
  try {
    const nearshore = registry.value.stations.filter(
      (s) => s.kind === 'nearshore' && s.sourceId !== null,
    )
    const buoys = registry.value.stations.filter((s) => s.kind === 'buoy' && s.sourceId !== null)

    const [nsResults, hwResult, buoyResults] = await Promise.all([
      Promise.all(
        nearshore.map(async (st) => {
          const id = st.sourceId as number
          try {
            return await fetchNearshoreRange(id, start, end)
          } catch {
            failed.push(st.name || `Station ${id}`)
            return { stationId: id, stationName: null, records: [] } as NearshoreSeries
          }
        }),
      ),
      fetchHomewood(start, end).catch(() => {
        failed.push('Homewood TC')
        return { stationId: -1, stationName: null, records: [] } as NearshoreSeries
      }),
      Promise.all(
        buoys.map(async (b) => {
          try {
            return { id: b.sourceId as number, name: b.name, records: await fetchNasaBuoy(b.sourceId as number, start, end) }
          } catch {
            failed.push(b.name)
            return { id: b.sourceId as number, name: b.name, records: [] as NasaBuoyRecord[] }
          }
        }),
      ),
    ])
    // A slower, older request must never overwrite a newer range/registry
    // result that already landed (PR review finding).
    if (gen !== loadGen) return
    series.value = [...nsResults, hwResult].filter((r) => r.records.length > 0)
    buoySeries.value = buoyResults.filter((b) => b.records.length > 0)
    failedSources.value = failed
  } finally {
    loadingCount.value--
  }
}
watch([days, registry], load, { immediate: true })
const loading = computed(() => loadingCount.value > 0)

/** Registry (editor-owned) name first; the API's Station_Name only covers
 *  stations the registry doesn't know about yet. */
function stationName(s: NearshoreSeries): string {
  const kind = s.stationId === -1 ? 'homewood' : 'nearshore'
  const registryName = registry.value.stations.find(
    (r) => r.kind === kind && (kind === 'homewood' || r.sourceId === s.stationId),
  )?.name
  if (registryName) return registryName
  if (s.stationName) return s.stationName
  return s.stationId === -1 ? 'Homewood TC' : `Station ${s.stationId}`
}

interface MetricDef {
  title: string
  unit: string
  qualityKey: QualityMetric
  pick: (r: NearshoreRecord) => number | null
}
/** All six parameters, per the demo decision — no tiles. */
const METRICS: MetricDef[] = [
  { title: 'Water temperature', unit: '°F', qualityKey: 'waterTemp', pick: (r) => r.waterTemp },
  { title: 'Wave height', unit: 'ft', qualityKey: 'waveHeight', pick: (r) => r.waveHeight },
  { title: 'Turbidity', unit: 'NTU', qualityKey: 'turbidity', pick: (r) => r.turbidity },
  { title: 'Conductivity', unit: 'mS/cm', qualityKey: 'conductivity', pick: (r) => r.conductivity },
  { title: 'Dissolved oxygen', unit: '% sat', qualityKey: 'dissolvedOxygen', pick: (r) => r.dissolvedOxygen },
  { title: 'Chlorophyll', unit: 'µg/L', qualityKey: 'chlorophyll', pick: (r) => r.chlorophyll },
]

/** Most recent non-null reading of a metric in a station's series. */
function latestValue<T>(records: T[], pick: (r: T) => number | null): number | null {
  for (let i = records.length - 1; i >= 0; i--) {
    const v = pick(records[i])
    if (v !== null) return v
  }
  return null
}

/** Implausible readings get no interpretation band — shown in the chart as
 *  reported, but never summarized as if trustworthy. */
function assess(metric: QualityMetric, value: number | null): QualityAssessment | null {
  if (metric === 'dissolvedOxygen' && value !== null && !isPlausible('dissolvedOxygen', value))
    return null
  return assessMetric(metric, value)
}

interface StationAssessment {
  name: string
  assessment: QualityAssessment
}

interface ChartDef extends MetricDef {
  series: ChartSeries[]
  assessRows: StationAssessment[]
  consensus: QualityAssessment | null
}

/**
 * Charts for a set of station series. The consensus is deliberately
 * conservative: one shared sentence only when every reporting station's
 * latest reading falls in the same band; otherwise the chips show the
 * spread. Buoys overlay the water-temperature chart only — the other five
 * parameters are near-shore instruments.
 */
function chartsFor(
  source: NearshoreSeries[],
  buoys: { id: number; name: string; records: NasaBuoyRecord[] }[],
): ChartDef[] {
  return METRICS.map((m) => {
    const chartSeries: ChartSeries[] = source.map((s, i) => ({
      label: stationName(s),
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      points: s.records.map((r) => ({ x: r.time, y: m.pick(r) })),
    }))
    const assessRows: StationAssessment[] = source
      .map((s) => {
        const assessment = assess(m.qualityKey, latestValue(s.records, m.pick))
        return assessment ? { name: stationName(s), assessment } : null
      })
      .filter((x): x is StationAssessment => x !== null)

    if (m.qualityKey === 'waterTemp') {
      for (const [i, b] of buoys.entries()) {
        chartSeries.push({
          label: `${b.name} (buoy)`,
          color: BUOY_COLORS[i % BUOY_COLORS.length],
          points: b.records.map((r) => ({ x: r.time, y: r.waterTemp })),
        })
        const assessment = assess('waterTemp', latestValue(b.records, (r) => r.waterTemp))
        if (assessment) assessRows.push({ name: `${b.name} (buoy)`, assessment })
      }
    }

    const labels = new Set(assessRows.map((r) => r.assessment.label))
    const consensus = labels.size === 1 ? assessRows[0].assessment : null
    return { ...m, series: chartSeries, assessRows, consensus }
  })
}

/** Focused buoy: water temperature is the only one of the six it measures. */
const focusedBuoy = computed(() => {
  const f = focusedStation.value
  if (!f || f.kind !== 'buoy') return null
  return buoySeries.value.find((b) => b.id === f.sourceId) ?? null
})

const selectionSeries = computed<NearshoreSeries[]>(() => {
  const f = focusedStation.value
  if (f) {
    if (f.kind === 'buoy') return []
    return series.value.filter((s) =>
      f.kind === 'homewood' ? s.stationId === -1 : s.stationId === f.sourceId,
    )
  }
  const dest = destination.value
  if (dest) {
    return series.value.filter(
      (s) =>
        dest.stationIds.includes(s.stationId) ||
        (dest.includesHomewood === true && s.stationId === -1),
    )
  }
  return series.value // whole lake
})

const selectionBuoys = computed(() => {
  const f = focusedStation.value
  if (f) return focusedBuoy.value ? [focusedBuoy.value] : []
  const dest = destination.value
  if (dest) return buoySeries.value.filter((b) => (dest.buoyIds ?? []).includes(b.id))
  return buoySeries.value // whole lake
})

const charts = computed(() => chartsFor(selectionSeries.value, selectionBuoys.value))
const hasChartData = computed(
  () => selectionSeries.value.length > 0 || selectionBuoys.value.length > 0,
)

const scopeTitle = computed(() => {
  if (focusedStation.value) {
    const f = focusedStation.value
    if (f.kind === 'buoy') return f.name || `NASA Buoy ${f.sourceId}`
    const s = selectionSeries.value[0]
    return s ? stationName(s) : f.name || `Station ${f.sourceId}`
  }
  if (destination.value) return destination.value.name
  return 'Whole lake — all reporting stations'
})

const focusedIsBuoy = computed(() => focusedStation.value?.kind === 'buoy')
/** For a focused buoy, only the water-temperature chart applies. */
const visibleCharts = computed(() =>
  focusedIsBuoy.value ? charts.value.filter((c) => c.qualityKey === 'waterTemp') : charts.value,
)
</script>

<template>
  <div class="wq">
    <p class="wq-sub">
      Multi-day charts for all six water-quality parameters, overlaid across
      the stations of your selection. One request per station per range —
      switching destination or station costs nothing.
    </p>

    <div class="wq-range-row">
      <span class="wq-range-label">Range</span>
      <button
        v-for="r in RANGES"
        :key="r.days"
        type="button"
        class="wq-range-btn"
        :class="{ active: r.days === days }"
        :aria-pressed="r.days === days"
        @click="days = r.days"
      >
        {{ r.label }}
      </button>
      <span v-if="loading" class="wq-loading-tag" role="status">updating…</span>
    </div>

    <p v-if="failedSources.length" class="wq-fetch-warn" role="alert">
      Live data could not be loaded for: {{ failedSources.join(', ') }} —
      charts may be incomplete. This is a data-service problem, not a
      station outage.
    </p>

    <div class="wq-scope-head">
      <h4 class="wq-title">
        {{ scopeTitle }}
        <span v-if="focusedIsBuoy" class="wq-buoy-tag">mid-lake buoy</span>
      </h4>
      <button v-if="focusedStation || destination" type="button" class="wq-clear" @click="clearSelection">
        ✕ Show whole lake
      </button>
    </div>

    <div v-if="focusedIsBuoy" class="wq-panel">
      <strong>Mid-lake buoys measure water temperature only.</strong>
      <p>
        Turbidity, conductivity, dissolved oxygen, and chlorophyll come from
        the near-shore stations — pick one on the map for the full set of
        charts.
      </p>
    </div>

    <template v-if="hasChartData">
      <div class="wq-chart-grid">
        <TimeSeriesChart
          v-for="c in visibleCharts"
          :key="c.title"
          :title="c.title"
          :unit="c.unit"
          :series="c.series"
        >
          <template #footer>
            <div v-if="c.assessRows.length" class="wq-assess">
              <div class="wq-chips">
                <span
                  v-for="r in c.assessRows"
                  :key="r.name"
                  class="wq-chip"
                  :style="bandChipStyle(r.assessment)"
                >
                  {{ c.assessRows.length > 1 ? `${r.name} · ` : '' }}{{ r.assessment.label }}
                </span>
              </div>
              <p class="wq-sentence">
                {{
                  c.consensus
                    ? c.consensus.sentence
                    : 'Latest readings fall in different bands by station — see the chips above.'
                }}
              </p>
            </div>
            <p v-if="c.qualityKey === 'waterTemp'" class="wq-cold-note">
              {{ COLD_WATER_SHOCK_NOTE }}
            </p>
          </template>
        </TimeSeriesChart>
      </div>
      <p class="wq-sentinel-note">
        Gaps in a line are deliberate: sentinel (−9.0) and missing readings are
        dropped during normalization, never interpolated. Interpretive bands
        reflect each station's latest reading and are draft placeholders
        pending TERC science review.
      </p>
    </template>
    <LoadingState v-else-if="loading" :lines="6" height="280px" />
    <div v-else class="wq-panel">
      <strong>No data for {{ scopeTitle }} in this window.</strong>
      <p>
        {{
          failedSources.length
            ? 'Some station requests failed (see the warning above) — try again shortly.'
            : focusedStation
              ? 'The station stays on the map and will chart data when it returns.'
              : 'None of the assigned stations reported during the selected range (a normal state for some stations).'
        }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.wq {
  display: grid;
  gap: 0.75rem;
}
.wq-sub {
  margin: 0;
  font-size: .8125rem;
  color: #4a5a64;
}
.wq-range-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wq-range-label {
  font-size: .8125rem;
  font-weight: 600;
  color: #4a5a64;
  margin-right: 4px;
}
.wq-range-btn {
  font: inherit;
  font-size: .8125rem;
  padding: 6px 14px;
  border-radius: 99px;
  border: 1px solid #d5dde2;
  background: #f7fafb;
  color: #4a5a64;
  cursor: pointer;
}
.wq-range-btn.active {
  background: #1c6b45;
  border-color: #1c6b45;
  color: #fff;
  font-weight: 600;
}
.wq-range-btn:focus-visible,
.wq-clear:focus-visible {
  outline: 3px solid #f0b323;
  outline-offset: 2px;
}
.wq-loading-tag {
  font-size: .8125rem;
  color: #1c6b45;
}
.wq-fetch-warn {
  margin: 0;
  font-size: .8125rem;
  line-height: 1.45;
  color: #a03a22;
  background: #fbe9e5;
  border-radius: 6px;
  padding: 8px 12px;
}
.wq-scope-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.wq-title {
  font-size: 1.125rem;
  margin: 0;
}
.wq-buoy-tag {
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
.wq-clear {
  font: inherit;
  font-size: .8125rem;
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
.wq-chart-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 900px) {
  .wq-chart-grid {
    grid-template-columns: 1fr;
  }
}
.wq-panel {
  background: #f7fafb;
  border: 1px dashed #d5dde2;
  border-radius: 8px;
  padding: 16px 18px;
  font-size: .875rem;
  color: #4a5a64;
}
.wq-panel p {
  margin: 6px 0 0;
}
.wq-assess {
  margin-top: 10px;
  border-top: 1px solid #d5dde2;
  padding-top: 8px;
}
.wq-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
/* Colors come from config/brandPalette.ts via custom properties (TERC-60). */
.wq-chip {
  background: var(--band-bg);
  color: var(--band-fg);
  font-size: .8125rem;
  font-weight: 600;
  border-radius: 99px;
  padding: 3px 9px;
}
.wq-sentence {
  margin: 7px 0 0;
  font-size: .8125rem;
  line-height: 1.45;
  color: #4a5a64;
}
.wq-cold-note {
  margin: 8px 0 0;
  font-size: .8125rem;
  line-height: 1.45;
  color: #8c4f17;
  background: #fdf3e0;
  border-radius: 4px;
  padding: 6px 8px;
}
.wq-sentinel-note {
  margin: 4px 0 0;
  font-size: .8125rem;
  /* #5f6e77 = 5.3:1 on white; the previous #7a8a92 failed WCAG AA (3.6:1). */
  color: #5f6e77;
  border-top: 1px solid #d5dde2;
  padding-top: 10px;
}
</style>
