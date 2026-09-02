<script setup lang="ts">
import { computed } from 'vue'
import FieldOverlay from './FieldOverlay.vue'
import GradientLegend from './GradientLegend.vue'
import LakeMap from './LakeMap.vue'
import LoadingState from './LoadingState.vue'
import { useModeledField } from '../composables/useModeledField'
import { COLD_WATER_SHOCK_NOTE } from '../config/qualitative'
import { TEMPERATURE_SCALE } from '../core/colorScale'
import { describeFieldExtent } from '../map/fieldSummary'

/**
 * Water Temperature view (TERC-23): the lake-wide forecast surface
 * temperature layer inside the Forecasted Conditions shell. The shell owns
 * the date/hour selection; this view reacts to it through
 * useModeledField('temperature') — cache-first, so stepping across viewed
 * hours re-renders instantly.
 *
 * Text alternative (a11y non-negotiable #1): the map layer is a canvas
 * image, so the same information is summarized as visible text — where
 * the lake runs warmest and coldest this hour, not just the numeric
 * range, since location IS the layer's essential information (PR review
 * finding) — which also labels the map region for assistive tech.
 */
const { state } = useModeledField('temperature')

const rangeSummary = computed(() => {
  if (state.value.status !== 'success' || !state.value.data) return null
  return describeFieldExtent(
    state.value.data,
    'Forecast surface temperature',
    (v) => `${Math.round(v)} °F`,
  )
})

/** Grid loaded successfully but every cell is masked (no modeled water
 *  cells) — an honest empty state, distinct from "still loading" and from
 *  "not fetched yet" (non-negotiable #4: empty is normal, but must say so). */
const noFieldData = computed(
  () => state.value.status === 'success' && !!state.value.data && !rangeSummary.value,
)

const mapLabel = computed(() => {
  const body =
    rangeSummary.value ??
    (noFieldData.value
      ? 'No forecast temperature data is available for this hour.'
      : 'No temperature data loaded.')
  return `Map of Lake Tahoe colored by forecast surface water temperature. ${body}`
})
</script>

<template>
  <div class="wt-view">
    <p class="wt-safety">
      The lake is never one temperature — wind can pull deep, cold water to
      the surface overnight (an upwelling), chilling a shoreline that was
      comfortable the day before. {{ COLD_WATER_SHOCK_NOTE }}
    </p>

    <p v-if="rangeSummary" class="wt-summary" aria-live="polite">{{ rangeSummary }}</p>
    <p v-else-if="noFieldData" class="wt-summary" aria-live="polite">
      No forecast temperature data is available for this hour.
    </p>

    <div class="wt-stage">
      <div class="wt-row">
        <LakeMap
          class="wt-map"
          static-map
          fit-lake
          basemap="muted"
          height="640px"
          :aria-label="mapLabel"
        >
          <FieldOverlay :grid="state.data ?? null" :scale="TEMPERATURE_SCALE" />
        </LakeMap>
        <GradientLegend :scale="TEMPERATURE_SCALE" variant="panel" class="wt-legend" />
      </div>
      <div v-if="state.status === 'loading'" class="wt-loading">
        <LoadingState :lines="2" />
      </div>
      <p v-if="state.status === 'error'" class="wt-error" role="alert">
        The temperature forecast for this hour could not be loaded. Try
        another hour, or come back shortly — real-time conditions are
        unaffected.
      </p>
    </div>
  </div>
</template>

<style scoped>
.wt-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.wt-safety {
  margin: 0;
  color: #5f6e77;
  max-width: 72ch;
}
.wt-summary {
  margin: 0;
  font-weight: 600;
}
.wt-stage {
  position: relative;
}
.wt-row {
  display: flex;
  gap: 24px;
  align-items: stretch;
}
.wt-map {
  flex: 1;
  min-width: 0;
}
.wt-legend {
  width: 150px;
  flex-shrink: 0;
  height: 640px;
}
/* The map is non-interactive (TERC-22) — visitors can't zoom in to
   compensate for a squeezed layout, so narrow viewports stack the legend
   under the full-width map instead of leaving it ~150px wide (PR review
   finding). */
@media (max-width: 640px) {
  .wt-row {
    flex-direction: column;
  }
  .wt-legend {
    width: 100%;
    height: 200px;
  }
}
.wt-loading {
  position: absolute;
  left: 14px;
  top: 14px;
  z-index: 900;
  width: 220px;
}
.wt-error {
  margin-top: 12px;
  background: #fdecea;
  border: 1px solid #f2b8ae;
  color: #8f2a16;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 0.875rem;
}
</style>
