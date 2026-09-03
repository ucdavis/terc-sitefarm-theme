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
    <!-- Optional intro copy from the host view; the forecast views' safety
         text is editor-owned and rendered by the shell instead (TERC-9). -->
    <div v-if="$slots.default" class="field-intro"><slot /></div>

    <p v-if="summary" class="field-summary" aria-live="polite">{{ summary }}</p>
    <p v-else-if="noFieldData" class="field-summary" aria-live="polite">{{ emptyMessage }}</p>

    <!-- Extra per-view chrome (e.g. the wind indicator on wave height). -->
    <slot name="chrome" />

    <div class="field-stage">
      <div class="field-row">
        <LakeMap
          class="field-map"
          static-map
          fit-lake
          basemap="muted"
          height="640px"
          :aria-label="mapLabel"
        >
          <FieldOverlay :grid="state.data ?? null" :scale="scale" />
        </LakeMap>
        <GradientLegend :scale="scale" variant="panel" class="field-legend" />
      </div>
      <div v-if="state.status === 'loading'" class="field-loading">
        <LoadingState :lines="2" />
      </div>
      <p v-if="state.status === 'error'" class="field-error" role="alert">
        {{ errorMessage }}
      </p>
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
  color: #5f6e77;
  max-width: 72ch;
}
.field-summary {
  margin: 0;
  font-weight: 600;
}
.field-stage {
  position: relative;
}
.field-row {
  display: flex;
  gap: 24px;
  align-items: stretch;
}
.field-map {
  flex: 1;
  min-width: 0;
}
.field-legend {
  width: 150px;
  flex-shrink: 0;
  height: 640px;
}
/* The map is non-interactive (TERC-22) — visitors can't zoom in to
   compensate for a squeezed layout, so narrow viewports stack the legend
   under the full-width map instead of leaving it ~150px wide. */
@media (max-width: 640px) {
  .field-row {
    flex-direction: column;
  }
  .field-legend {
    width: 100%;
    height: 200px;
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
  margin-top: 12px;
  background: #fdecea;
  border: 1px solid #f2b8ae;
  color: #8f2a16;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 0.875rem;
}
</style>
