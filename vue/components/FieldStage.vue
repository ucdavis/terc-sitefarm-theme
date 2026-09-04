<script setup lang="ts">
import { computed } from 'vue'
import FieldOverlay from './FieldOverlay.vue'
import GradientLegend from './GradientLegend.vue'
import LakeMap from './LakeMap.vue'
import LoadingState from './LoadingState.vue'
import type { ColorScale } from '../core/colorScale'
import type { RequestState } from '../core/requestState'
import type { ScalarGrid } from '../data/gridDecode'
import { describeFieldExtent } from '../map/fieldSummary'

/**
 * The shared stage for every Forecasted Conditions field layer (TERC-23
 * temperature, TERC-25 currents, TERC-24 wave height): map + colorbar,
 * the spoken text alternative, the loading skeleton, and the honest
 * empty/error states.
 *
 * It exists because those parts are accessibility-critical and identical
 * across the views — triplicating them is how a fix lands in one view and
 * silently misses the others. Each view stays a thin wrapper owning only
 * what actually differs: its data source, its scale, and its safety copy.
 *
 * Takes `state` as a prop rather than fetching, so a view can drive it
 * from useModeledField (temperature/currents) or from its own loader
 * (wave height resolves a precomputed wind bucket instead).
 */
const props = withDefaults(
  defineProps<{
    state: RequestState<ScalarGrid>
    scale: ColorScale
    /** Sentence subject for the text alternative, e.g. "Forecast current speed". */
    subject: string
    /** Decimals in spoken values — 0 for °F and ft/min, 1 for wave feet. */
    digits?: number
    /** Leading clause of the map's accessible name. */
    mapDescription: string
    /** Shown when the grid loads but holds no modeled water cells. */
    emptyMessage: string
    /** Shown when the grid itself fails to load. */
    errorMessage: string
  }>(),
  { digits: 0 },
)

const summary = computed(() => {
  if (props.state.status !== 'success' || !props.state.data) return null
  return describeFieldExtent(
    props.state.data,
    props.subject,
    (v) => `${v.toFixed(props.digits)} ${props.scale.unit}`,
  )
})

/**
 * Nothing to draw, but the request finished — an honest empty state,
 * distinct from "still loading" and from "not fetched yet"
 * (non-negotiable #4). Two ways to get here: the loader reported `empty`
 * outright (TERC-24 resolves no wind bucket close enough to the forecast),
 * or a grid arrived whose every cell is masked.
 */
const noFieldData = computed(
  () =>
    props.state.status === 'empty' ||
    (props.state.status === 'success' && !!props.state.data && !summary.value),
)

const mapLabel = computed(() => {
  const body =
    summary.value ?? (noFieldData.value ? props.emptyMessage : 'No data loaded yet.')
  return `${props.mapDescription} ${body}`
})
</script>

<template>
  <div class="field-view">
    <!-- Two columns from desktop widths (TERC-64), matching the Real-Time
         page: a tall, lake-framing map on the left and everything that
         reads about it — summary, per-view chrome, legend, the editor's
         text — in a column beside it. One stack below that. -->
    <div class="field-row">
      <!-- The map block: the map with its vertical colorbar beside it, read
           together as one figure. -->
      <div class="field-map-col">
        <LakeMap
          class="field-map"
          static-map
          fit-lake
          basemap="muted"
          height="var(--field-map-height, 470px)"
          :aria-label="mapLabel"
        >
          <FieldOverlay :grid="state.data ?? null" :scale="scale" />
        </LakeMap>
        <GradientLegend :scale="scale" variant="panel" class="field-legend" />
        <div v-if="state.status === 'loading'" class="field-loading">
          <LoadingState :lines="2" />
        </div>
      </div>

      <div class="field-side">
        <!-- Optional intro copy from the host view; the forecast views'
             safety text is editor-owned and arrives via the side slot. -->
        <div v-if="$slots.default" class="field-intro"><slot /></div>

        <p v-if="summary" class="field-summary" aria-live="polite">{{ summary }}</p>
        <p v-else-if="noFieldData" class="field-summary" aria-live="polite">{{ emptyMessage }}</p>

        <!-- Extra per-view chrome (e.g. the wind indicator on wave height). -->
        <slot name="chrome" />

        <p v-if="state.status === 'error'" class="field-error" role="alert">
          {{ errorMessage }}
        </p>

        <!-- The host's reading matter for this view (the shell's editor-owned text). -->
        <slot name="side" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.field-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field-intro {
  font-size: 0.9375rem;
  line-height: 1.5;
  max-width: 72ch;
}
.field-summary {
  margin: 0;
  font-weight: 600;
}
/* Same numbers as the Real-Time map row (CurrentConditionsShell): one
   column and a 470px map on phones; from 900px a sticky map block — the
   480px-wide, 780px-tall map plus its colorbar — beside the reading
   column. */
.field-row {
  --field-map-height: 470px;
  --field-legend-width: 110px;
  display: grid;
  gap: 1rem;
  align-items: start;
}
.field-map-col {
  position: relative;
  min-width: 0;
  display: flex;
  gap: 16px;
  align-items: stretch;
}
.field-map {
  flex: 1;
  min-width: 0;
}
.field-legend {
  width: var(--field-legend-width);
  flex-shrink: 0;
  height: var(--field-map-height);
}
/* Phones: the colorbar drops under the map, shorter. */
@media (max-width: 899px) {
  .field-map-col {
    flex-direction: column;
  }
  .field-legend {
    width: 100%;
    height: 200px;
  }
}
.field-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
@media (min-width: 900px) {
  .field-row {
    --field-map-height: 780px;
    grid-template-columns: calc(480px + 16px + var(--field-legend-width)) minmax(0, 1fr);
  }
  .field-map-col {
    position: sticky;
    top: 1rem;
  }
}
.field-loading {
  position: absolute;
  left: 14px;
  top: 14px;
  z-index: 900;
  width: 220px;
}
.field-error {
  margin: 0;
  background: #fdecea;
  border: 1px solid #f2b8ae;
  color: #8f2a16;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 0.875rem;
}
</style>
