<script setup lang="ts">
import { computed } from 'vue'
import { useModelTime } from '../composables/useModelTime'
import { fmtLakeDay } from '../core/time'

/**
 * Date dropdown + hour stepper + "Next 24 h" playback driving the shared
 * Forecasted Conditions time selection (TERC-22). The selector only
 * mutates shared state; views react. Stepping across already-viewed hours
 * is instant (cache hits), which is what makes arrow-key scrubbing and
 * playback feel continuous.
 *
 * Accessibility: real labels on every control, the hour readout is a
 * polite live region (screen readers hear each step and playback tick
 * land), playback state is a toggle (aria-pressed), and the whole group
 * supports ← / → scrubbing from one focus stop.
 */
const {
  frames,
  selectedIndex,
  selectedFrame,
  dates,
  selectDate,
  stepHour,
  playing,
  playNext24h,
  stopPlay,
} = useModelTime()

const canBack = computed(() => selectedIndex.value > 0)
const canFwd = computed(() => selectedIndex.value < frames.value.length - 1)

/** "Mon, Aug 18" labels keyed by the manifest's raw date strings. */
const dateOptions = computed(() =>
  dates.value.map((d) => {
    const frame = frames.value.find((f) => f.date === d)
    return { value: d, label: frame ? fmtLakeDay(frame.time) : d }
  }),
)

const hourLabel = computed(() => {
  const f = selectedFrame.value
  if (!f) return '—'
  const h = f.hour
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:00 ${ampm}`
})

const isForecast = computed(() => {
  const f = selectedFrame.value
  return f ? f.time.getTime() > Date.now() : false
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    stepHour(-1)
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    stepHour(1)
  }
}
</script>

<template>
  <div
    class="selector"
    role="group"
    aria-label="Forecast date and time. Left and right arrow keys step one model hour."
    tabindex="0"
    @keydown="onKeydown"
  >
    <label class="sel-label">
      Date
      <select
        class="date-select"
        :value="selectedFrame?.date ?? ''"
        @change="selectDate(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="d in dateOptions" :key="d.value" :value="d.value">{{ d.label }}</option>
      </select>
    </label>
    <div class="hour-stepper">
      <button
        class="step-btn"
        type="button"
        :disabled="!canBack"
        aria-label="Previous hour"
        @click="stepHour(-1)"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <div class="hour-display" aria-live="polite">
        <span class="hour-value">{{ hourLabel }}</span>
        <span v-if="isForecast" class="forecast-tag">forecast</span>
      </div>
      <button
        class="step-btn"
        type="button"
        :disabled="!canFwd"
        aria-label="Next hour"
        @click="stepHour(1)"
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>
    <button
      class="play-btn"
      type="button"
      :class="{ playing }"
      :disabled="!playing && !canFwd"
      :aria-pressed="playing"
      :title="playing ? 'Stop the animation' : 'Animate through the next 24 hours of model output'"
      @click="playing ? stopPlay() : playNext24h()"
    >
      <span aria-hidden="true">{{ playing ? '◼' : '▶' }}</span>
      {{ playing ? ' Stop' : ' Next 24 h' }}
    </button>
    <span v-if="frames.length" class="frame-count">
      hour {{ selectedIndex + 1 }} / {{ frames.length }}
    </span>
  </div>
</template>

<style scoped>
.selector {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: #f6f9fa;
  border: 1px solid #d5dde2;
  border-radius: 8px;
  outline: none;
}
.selector:focus-visible {
  outline: 3px solid #f0b323;
  outline-offset: 2px;
}
.sel-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
  color: #5f6e77;
  font-weight: 600;
}
.date-select {
  font: inherit;
  font-size: 0.875rem;
  padding: 6px 8px;
  border: 1px solid #b9c6cd;
  border-radius: 6px;
  background: #fff;
  color: #22343c;
}
.date-select:focus-visible,
.step-btn:focus-visible,
.play-btn:focus-visible {
  outline: 3px solid #f0b323;
  outline-offset: 2px;
}
.hour-stepper {
  display: flex;
  align-items: center;
  gap: 8px;
}
.step-btn {
  width: 34px;
  height: 34px;
  font-size: 1.25rem;
  line-height: 1;
  border: 1px solid #b9c6cd;
  border-radius: 6px;
  background: #fff;
  color: #1d5b68;
  cursor: pointer;
}
.step-btn:hover:not(:disabled) {
  background: #eef4f6;
}
.step-btn:disabled {
  color: #b9c6cd;
  cursor: default;
}
.hour-display {
  min-width: 92px;
  text-align: center;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.hour-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.forecast-tag {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #1d5b68;
}
.frame-count {
  font-size: 0.75rem;
  color: #5f6e77;
  font-variant-numeric: tabular-nums;
}
.play-btn {
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 7px 14px;
  border-radius: 99px;
  border: 1px solid #1d5b68;
  background: #1d5b68;
  color: #fff;
  cursor: pointer;
}
.play-btn:hover:not(:disabled) {
  filter: brightness(1.08);
}
.play-btn.playing {
  background: #fff;
  color: #1d5b68;
}
.play-btn:disabled {
  background: #f6f9fa;
  border-color: #b9c6cd;
  color: #5f6e77;
  cursor: default;
}
</style>
