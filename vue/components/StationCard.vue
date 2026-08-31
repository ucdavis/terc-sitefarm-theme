<script setup lang="ts">
import { computed } from 'vue'
import type { QualityAssessment } from '../config/qualitative'

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

const timeLabel = computed(() => {
  if (!props.timestamp) return null
  return props.timestamp.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
})
</script>

<template>
  <div class="station-card" :class="{ offline: display === null }">
    <div class="card-label">{{ label }}</div>
    <div v-if="display !== null" class="card-value">
      {{ display }}<span class="card-unit">{{ unit }}</span>
      <span v-if="suspect" class="suspect" :title="suspectNote ?? 'Outside expected physical range — possible sensor issue'">⚠</span>
    </div>
    <div v-else class="card-novalue">no data available</div>
    <div class="card-meta">
      <span v-if="stationName">{{ stationName }}</span>
      <span v-if="timeLabel"> · {{ timeLabel }}</span>
    </div>
    <div v-if="suspect && display !== null" class="suspect-note">
      {{ suspectNote ?? 'Outside expected range — shown as reported, flagged as suspect.' }}
    </div>
    <div v-if="assessment && display !== null && !suspect" class="assess" :class="`tone-${assessment.tone}`">
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
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #4a5a64;
  font-weight: 600;
  margin-bottom: 6px;
}
.card-value {
  font-size: 28px;
  font-weight: 600;
  color: #13322b;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.card-unit {
  font-size: 15px;
  font-weight: 500;
  color: #4a5a64;
  margin-left: 3px;
}
.card-novalue {
  font-size: 14px;
  color: #7a8a92;
  font-style: italic;
  padding: 6px 0;
}
.card-meta {
  margin-top: 6px;
  font-size: 11px;
  color: #7a8a92;
}
.suspect {
  font-size: 15px;
  margin-left: 6px;
  cursor: help;
}
.suspect-note {
  margin-top: 6px;
  font-size: 11px;
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
.assess-label {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 99px;
  padding: 2px 8px;
}
.assess-text {
  margin: 5px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: #4a5a64;
}
.tone-good .assess-label {
  background: #e3f0e9;
  color: #1c6b45;
}
.tone-fair .assess-label {
  background: #fdf3e0;
  color: #8f6614;
}
.tone-caution .assess-label {
  background: #fbe9e5;
  color: #a03a22;
}
.tone-info .assess-label {
  background: #e4ecf7;
  color: #24558f;
}
</style>
