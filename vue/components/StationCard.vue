<script setup lang="ts">
import { computed } from 'vue'
import { bandChipStyle } from '../config/brandPalette'
import type { QualityAssessment } from '../config/qualitative'
import { fmtLakeTime } from '../core/time'

/**
 * One reading: value + units + timestamp, with explicit offline/no-data and
 * suspect (implausible range) presentations. Optionally carries a
 * plain-language quality assessment (config/qualitative.ts, TERC-21 —
 * editor-owned scales arrive with TERC-52).
 */
const props = defineProps<{
  label: string
  value: number | null
  unit: string
  digits?: number
  timestamp?: Date | null
  stationName?: string | null
  /** Set when the value is outside its plausible physical range. */
  suspect?: boolean
  suspectNote?: string
  /** Qualitative interpretation band for this reading. */
  assessment?: QualityAssessment | null
}>()

const display = computed(() => {
  if (props.value === null || props.value === undefined) return null
  return props.value.toFixed(props.digits ?? 1)
})

// Lake time, not viewer-local (TERC-43 display rule).
const timeLabel = computed(() =>
  props.timestamp ? `${fmtLakeTime(props.timestamp)} lake time` : null,
)
</script>

<template>
  <div class="station-card" :class="{ offline: display === null }">
    <div class="card-label">{{ label }}</div>
    <div v-if="display !== null" class="card-value">
      {{ display }}<span class="card-unit">{{ unit }}</span>
      <!-- Decorative: the full suspect note renders as text below the value,
           so assistive tech gets the real message, not a title tooltip. -->
      <span v-if="suspect" class="suspect" aria-hidden="true" :title="suspectNote ?? 'Outside expected physical range — possible sensor issue'">⚠</span>
    </div>
    <div v-else class="card-novalue">no data available</div>
    <div class="card-meta">
      <span v-if="stationName">{{ stationName }}</span>
      <span v-if="timeLabel"> · {{ timeLabel }}</span>
    </div>
    <div v-if="suspect && display !== null" class="suspect-note">
      {{ suspectNote ?? 'Outside expected range — shown as reported, flagged as suspect.' }}
    </div>
    <div v-if="assessment && display !== null && !suspect" class="assess" :style="bandChipStyle(assessment)">
      <span class="assess-label">{{ assessment.label }}</span>
      <p class="assess-text">{{ assessment.sentence }}</p>
    </div>
  </div>
</template>

<style scoped>
.station-card {
  background: #f7fafb;
  border: 1px solid #d5dde2;
  border-radius: 8px;
  padding: 14px 16px;
  min-width: 150px;
}
.station-card.offline {
  background: #eef2f4;
}
.card-label {
  font-size: .8125rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #4a5a64;
  font-weight: 600;
  margin-bottom: 6px;
}
.card-value {
  font-size: 1.75rem;
  font-weight: 600;
  color: #13322b;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.card-unit {
  font-size: .9375rem;
  font-weight: 500;
  color: #4a5a64;
  margin-left: 3px;
}
.card-novalue {
  font-size: .875rem;
  color: #7a8a92;
  font-style: italic;
  padding: 6px 0;
}
.card-meta {
  margin-top: 6px;
  font-size: .8125rem;
  color: #7a8a92;
}
.suspect {
  font-size: .9375rem;
  margin-left: 6px;
  cursor: help;
}
.suspect-note {
  margin-top: 6px;
  font-size: .8125rem;
  color: #9a6b15;
  background: #fdf6e7;
  border-radius: 4px;
  padding: 4px 6px;
}
.assess {
  margin-top: 8px;
  border-top: 1px solid #d5dde2;
  padding-top: 7px;
}
/* Colors arrive as custom properties from config/brandPalette.ts — the one
   source for tone defaults and brand treatments (TERC-60). */
.assess-label {
  background: var(--band-bg);
  color: var(--band-fg);
  display: inline-block;
  font-size: .65625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 99px;
  padding: 2px 8px;
}
.assess-text {
  margin: 5px 0 0;
  font-size: .8125rem;
  line-height: 1.45;
  color: #4a5a64;
}
</style>
