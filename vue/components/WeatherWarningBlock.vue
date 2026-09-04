<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { fetchWeatherAlerts, type WeatherAlert } from '../data/weatherAlerts'

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
  controller = new AbortController()
  status.value = 'loading'

  try {
    const result = await fetchWeatherAlerts(controller.signal)
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
  <section class="alert alert--warning alert--icon weather-warning" aria-label="Lake Tahoe weather alerts">
    <div class="alert__inner weather-warning__inner">
      <div class="weather-warning__summary" aria-live="polite">
        <template v-if="status === 'ready'">
          <strong>{{ alerts.length }} active {{ alerts.length === 1 ? 'alert' : 'alerts' }}</strong>
          <span v-if="alerts.length">Highest severity: {{ highestSeverity }}</span>
          <span v-else>No alerts are currently in effect.</span>
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
    </div>
  </section>
</template>

<style scoped>
.weather-warning {
  margin: 0;
}
.weather-warning__inner {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
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
@media (max-width: 32rem) {
  .weather-warning__inner {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
