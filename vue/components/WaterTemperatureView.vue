<script setup lang="ts">
import FieldStage from './FieldStage.vue'
import { useModeledField } from '../composables/useModeledField'
import { COLD_WATER_SHOCK_NOTE } from '../config/qualitative'
import { TEMPERATURE_SCALE } from '../core/colorScale'

/**
 * Water Temperature view (TERC-23): the lake-wide forecast surface
 * temperature layer inside the Forecasted Conditions shell. The shell owns
 * the date/hour selection; this view reacts to it through
 * useModeledField('temperature') — cache-first, so stepping across viewed
 * hours re-renders instantly.
 *
 * Map, colorbar, text alternative, and the empty/error states live in
 * FieldStage, shared with the other field views.
 */
const { state } = useModeledField('temperature')
</script>

<template>
  <FieldStage
    :state="state"
    :scale="TEMPERATURE_SCALE"
    subject="Forecast surface temperature"
    map-description="Map of Lake Tahoe colored by forecast surface water temperature."
    empty-message="No forecast temperature data is available for this hour."
    error-message="The temperature forecast for this hour could not be loaded. Try another hour, or come back shortly — real-time conditions are unaffected."
  >
    <p class="wt-safety">
      The lake is never one temperature — wind can pull deep, cold water to
      the surface overnight (an upwelling), chilling a shoreline that was
      comfortable the day before. {{ COLD_WATER_SHOCK_NOTE }}
    </p>
  </FieldStage>
</template>

<style scoped>
.wt-safety {
  margin: 0;
}
</style>
