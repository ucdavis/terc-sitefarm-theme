<script setup lang="ts">
import { computed, ref } from 'vue'
import { TAHOE_ZONE_LABELS } from '../config/endpoints'
import { fmtLakeTime } from '../core/time'
import type { WeatherAlert } from '../data/weatherAlerts'

const props = defineProps<{ alert: WeatherAlert }>()
const detailsExpanded = ref(false)
const fullTextExpanded = ref(false)

const when = computed(() => {
  if (props.alert.onset && props.alert.ends) {
    return `${fmtLakeTime(props.alert.onset)} → ${fmtLakeTime(props.alert.ends)}`
  }
  if (props.alert.onset) return `From ${fmtLakeTime(props.alert.onset)}`
  if (props.alert.ends) return `Until ${fmtLakeTime(props.alert.ends)}`
  return 'Not specified'
})

const zoneLabels = computed(() =>
  props.alert.zones.map((zone) => TAHOE_ZONE_LABELS[zone] ?? zone),
)
</script>

<template>
  <article class="weather-alert-card" :class="`weather-alert-card--${alert.severity.toLowerCase()}`">
    <header class="weather-alert-card__header">
      <h3>{{ alert.event }}</h3>
      <span class="weather-alert-card__severity">{{ alert.severity }} severity</span>
    </header>

    <p v-if="alert.headline" class="weather-alert-card__headline">{{ alert.headline }}</p>

    <button
      type="button"
      class="weather-alert-card__toggle weather-alert-card__details-toggle"
      :aria-expanded="detailsExpanded"
      @click="detailsExpanded = !detailsExpanded"
    >
      {{ detailsExpanded ? 'Show less' : 'Show more' }}
    </button>

    <dl v-if="detailsExpanded" class="weather-alert-card__meta">
      <div><dt>When</dt><dd>{{ when }}</dd></div>
      <div><dt>Area</dt><dd>{{ alert.areaDesc || 'Not specified' }}</dd></div>
      <div><dt>Zone</dt><dd>{{ zoneLabels.length ? zoneLabels.join(' · ') : 'Not specified' }}</dd></div>
      <div><dt>Urgency</dt><dd>{{ alert.urgency }} · {{ alert.certainty }}</dd></div>
      <div><dt>Issued by</dt><dd>{{ alert.senderName }}</dd></div>
    </dl>

    <p v-if="alert.instruction" class="weather-alert-card__instruction">{{ alert.instruction }}</p>

    <button
      v-if="alert.description"
      type="button"
      class="weather-alert-card__toggle"
      :aria-expanded="fullTextExpanded"
      @click="fullTextExpanded = !fullTextExpanded"
    >
      {{ fullTextExpanded ? 'Hide full text' : 'Full text' }}
    </button>
    <pre v-if="fullTextExpanded" class="weather-alert-card__description">{{ alert.description }}</pre>
  </article>
</template>

<style scoped>
.weather-alert-card {
  padding: 1rem 1.125rem;
  border: 1px solid #c8d3d9;
  border-left: 0.25rem solid #6f777b;
  border-radius: 0.5rem;
  background: #fff;
  color: #191919;
  font-style: normal;
}
.weather-alert-card--extreme { border-left-color: #a3160e; }
.weather-alert-card--severe { border-left-color: #d3541f; }
.weather-alert-card--moderate {
  border: none;
  border-left: none;
  background: #cccccc40;
}
.weather-alert-card--minor { border-left-color: #2f7ab8; }
.weather-alert-card__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.weather-alert-card__header h3 {
  margin: 0;
  font-size: 1.125rem;
  line-height: 1.3;
}
.weather-alert-card__severity {
  padding: 0.15rem 0.5rem;
  border: 1px solid #b9c6cd;
  border-radius: 99rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}
.weather-alert-card__headline {
  margin: 0.5rem 0 0;
  font-weight: 600;
}
.weather-alert-card__details-toggle {
  margin-top: 0.5rem;
  background: #ffdf80;
}
.weather-alert-card__meta {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1rem;
  margin: 1rem 0 0;
}
.weather-alert-card__meta div {
  min-width: 0;
}
.weather-alert-card__meta dt {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}
.weather-alert-card__meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.weather-alert-card__instruction {
  margin: 1rem 0 0;
  padding: 0.75rem;
  border-radius: 0.375rem;
  background: #00000020;
}
.weather-alert-card__toggle {
  margin-top: 1rem;
  border: 1px solid #8b979e;
  border-radius: 99rem;
  padding: 0.35rem 0.75rem;
  background: #fff;
  color: inherit;
  cursor: pointer;
}
.weather-alert-card__toggle:focus-visible {
  outline: 3px solid #f0b323 !important;
  outline-offset: 2px !important;
}
.weather-alert-card__description {
  max-height: 18rem;
  margin: 0.75rem 0 0;
  padding: 0.75rem;
  overflow: auto;
  border-radius: 0.375rem;
  background: #00000020;
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1.55;
  white-space: pre-wrap;
}
@media (max-width: 32rem) {
  .weather-alert-card__meta {
    grid-template-columns: 1fr;
  }
}
</style>
