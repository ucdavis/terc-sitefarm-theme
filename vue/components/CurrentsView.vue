<script setup lang="ts">
import FieldStage from './FieldStage.vue'
import { useModeledField } from '../composables/useModeledField'
import { CURRENT_SCALE } from '../core/colorScale'

/**
 * Currents view (TERC-25): lake-wide forecast surface current speed
 * inside the Forecasted Conditions shell.
 *
 * The grids hold two velocity components; the decode step reduces them to
 * speed magnitude √(u² + v²) in ft/min (see data/gridDecode.ts), which is
 * independent of which stored plane is u and which is v. Direction is not
 * shown — the safety story here is "how fast is the water moving where",
 * and an arrow field at 200 m resolution would imply a precision the
 * model output doesn't carry at the shoreline.
 *
 * Map, colorbar, text alternative, and the empty/error states live in
 * FieldStage, shared with the other field views.
 */
const { state } = useModeledField('flow')
</script>

<template>
  <FieldStage
    :state="state"
    :scale="CURRENT_SCALE"
    subject="Forecast current speed"
    map-description="Map of Lake Tahoe colored by forecast surface current speed."
    empty-message="No forecast current data is available for this hour."
    error-message="The current forecast for this hour could not be loaded. Try another hour, or come back shortly — real-time conditions are unaffected."
  >
    <template #side><slot name="side" /></template>
  </FieldStage>
  <!-- The gyre/rip-current copy is editor-owned block text, rendered by
       the shell beside this panel (TERC-9). -->
</template>
