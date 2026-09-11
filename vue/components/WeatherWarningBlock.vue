<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import WeatherAlertCard from './WeatherAlertCard.vue'
import { fetchWeatherAlerts, sampleWeatherAlerts, type WeatherAlert } from '../data/weatherAlerts'
import { blockBool } from '../lib/blockBool'

const props = withDefaults(
  defineProps<{
    /**
     * "Show a sample alert (testing only)" block setting (TERC-66): render
     * a real, archived advisory instead of asking the NWS, so the display
     * can be checked when nothing is in effect. Always labelled as such.
     */
    sampleAlert?: boolean | number | string
  }>(),
  { sampleAlert: false },
)
const isSample = blockBool(props.sampleAlert)

const alerts = ref<WeatherAlert[]>([])
const status = ref<'loading' | 'ready' | 'error'>('loading')
const severityRank: Record<string, number> = {
  Unknown: 0,
  Minor: 1,
  Moderate: 2,
  Severe: 3,
  Extreme: 4,
}
const highestSeverity = computed(() => alerts.value.reduce(
  (highest, alert) => (severityRank[alert.severity] ?? 0) > (severityRank[highest] ?? 0)
    ? alert.severity
    : highest,
  'Unknown',
))

let generation = 0
let controller: AbortController | null = null

async function refresh(): Promise<void> {
  const currentGeneration = ++generation
  controller?.abort()
  status.value = 'loading'

  try {
    const result = isSample
      ? await sampleWeatherAlerts()
      : await fetchWeatherAlerts((controller = new AbortController()).signal)
    if (currentGeneration !== generation) return
    alerts.value = result
    status.value = 'ready'
  } catch (error) {
    if (currentGeneration !== generation || (error instanceof DOMException && error.name === 'AbortError')) return
    status.value = 'error'
  }
}

void refresh()
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <section
    v-if="status !== 'ready' || alerts.length"
    class="alert alert--warning alert--icon weather-warning"
    :class="{ 'weather-warning--sample': isSample }"
    :aria-label="isSample ? 'Lake Tahoe weather alerts (sample alert, not live)' : 'Lake Tahoe weather alerts'"
  >
    <div class="alert__inner weather-warning__inner">
      <div class="weather-warning__summary" aria-live="polite">
        <!-- A sample must never pass for a real advisory: say so first. -->
        <span v-if="isSample" class="weather-warning__sample">Sample alert — not live</span>
        <template v-if="status === 'ready'">
          <strong>{{ alerts.length ? `${alerts.length} active ${alerts.length === 1 ? 'alert' : 'alerts'}` : 'No active alerts' }}</strong>
          <span v-if="alerts.length">Highest severity: {{ highestSeverity }}</span>
          <span v-else>Conditions are clear for both Tahoe forecast zones.</span>
        </template>
        <template v-else-if="status === 'error'">
          <strong>Weather alerts unavailable</strong>
          <span>Refresh to try again.</span>
        </template>
        <template v-else>
          <strong>Checking weather alerts</strong>
          <span>Please wait.</span>
        </template>
      </div>

      <button class="weather-warning__refresh" type="button" :disabled="status === 'loading'" @click="refresh">
        Refresh
      </button>

      <ul v-if="status === 'ready' && alerts.length" class="weather-warning__list">
        <li v-for="alert in alerts" :key="alert.id">
          <WeatherAlertCard :alert="alert" />
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.weather-warning {
  margin: 0;
}
.weather-warning__inner {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 1rem;
}
.weather-warning__summary {
  min-width: 0;
  display: grid;
  line-height: 1.35;
}
.weather-warning__summary strong {
  font-size: 1.125rem;
}
.weather-warning__sample {
  justify-self: start;
  margin-bottom: 0.25rem;
  padding: 0.15rem 0.6rem;
  border-radius: 99px;
  border: 1px dashed currentColor;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.weather-warning__refresh {
  min-width: 7rem;
  border: 1px solid #c8d3d9;
  border-radius: 2rem;
  padding: 0.55rem 1.25rem;
  background: #fff;
  color: inherit;
  cursor: pointer;
}
.weather-warning__refresh:hover:not(:disabled) {
  background: #f4f7f9;
}
.weather-warning__refresh:focus-visible {
  outline: 3px solid currentColor;
  outline-offset: 3px;
}
.weather-warning__refresh:disabled {
  cursor: wait;
  opacity: 0.65;
}
.weather-warning__list {
  grid-column: 1 / -1;
  display: grid;
  gap: 0.875rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
@media (max-width: 32rem) {
  .weather-warning__inner {
    grid-template-columns: 1fr;
  }
  .weather-warning__refresh {
    justify-self: start;
  }
  .weather-warning__list {
    grid-column: 1;
  }
}
</style>
