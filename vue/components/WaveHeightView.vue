<script setup lang="ts">
import { computed } from 'vue'
import FieldStage from './FieldStage.vue'
import { useWaveField } from '../composables/useWaveField'
import { WAVE_SCALE } from '../core/colorScale'
import { compassName } from '../data/noaa'

/**
 * Wave Height view (TERC-24). Unlike temperature and currents, waves
 * aren't read straight from an hourly grid: TERC precomputed a STWAVE
 * solution for every wind speed/direction pair, so this view asks NOAA
 * what the wind will be, picks the closest precomputed answer, and draws
 * it (see data/waveHeight.ts).
 *
 * Map, colorbar, text alternative and empty/error states come from
 * FieldStage; the wind indicator and the wind-specific caveats are this
 * view's own.
 */
const { state, wind, windOffsetHours, bucket, substituted, isCalm } = useWaveField()

/**
 * Point the arrow where the wind is going. Two rotations compose here:
 * meteorological direction is where wind comes FROM, so the bearing to
 * draw is dirDeg + 180; and the glyph already points right (east, bearing
 * 90) at rotation 0, so the CSS angle is that bearing minus 90 — i.e.
 * dirDeg + 90. Dropping the second term leaves the arrow 90° off, which
 * looks plausible enough on a round lake to pass a glance.
 */
const arrowStyle = computed(() => ({
  transform: `rotate(${wind.value ? (wind.value.dirDeg + 90) % 360 : 0}deg)`,
}))

const windText = computed(() => {
  if (!wind.value) return null
  return `${wind.value.speedMph.toFixed(0)} mph from the ${compassName(wind.value.dirDeg)}`
})

const caveats = computed(() => {
  const out: string[] = []
  if (windOffsetHours.value !== 0) {
    const n = Math.abs(windOffsetHours.value)
    out.push(`using the wind forecast from ${n} hour${n === 1 ? '' : 's'} ${windOffsetHours.value < 0 ? 'earlier' : 'later'}`)
  }
  if (substituted.value) out.push('showing the nearest available wind solution')
  return out
})
</script>

<template>
  <FieldStage
    :state="state"
    :scale="WAVE_SCALE"
    subject="Forecast wave height"
    :digits="1"
    map-description="Map of Lake Tahoe colored by forecast wave height."
    empty-message="No wind forecast covers this hour, so wave heights can't be shown for it. Wave forecasts follow the wind forecast, which runs from about half a day ago through the next week."
    error-message="The wave forecast for this hour could not be loaded. Try another hour, or come back shortly — real-time conditions are unaffected."
  >
    <p class="wv-safety">
      Waves here are driven by wind: how hard it blows, how far it blows
      across open water (the fetch), and how deep that water is. The same
      wind builds much bigger waves on a long, exposed shore than in a
      sheltered bay — which is why the east and south shores can be rough
      while the west shore stays calm.
    </p>

    <template #chrome>
      <div v-if="wind" class="wv-wind">
        <span class="wv-arrow" :style="arrowStyle" aria-hidden="true">➤</span>
        <p class="wv-wind-text">
          <strong>Forecast wind: {{ windText }}</strong>
          <span v-if="caveats.length" class="wv-caveat"> ({{ caveats.join('; ') }})</span>
        </p>
      </div>
      <p v-if="isCalm" class="wv-calm" role="status">
        The wind forecast is calm, so the model shows no measurable waves
        anywhere on the lake — the whole surface is at the bottom of the
        scale, not missing.
      </p>
    </template>
  </FieldStage>
</template>

<style scoped>
.wv-safety {
  margin: 0;
}
.wv-wind {
  display: flex;
  align-items: center;
  gap: 12px;
}
.wv-arrow {
  font-size: 1.5rem;
  line-height: 1;
  color: #1d5b68;
  /* The glyph points right at 0deg; rotation is applied inline. */
  display: inline-block;
}
.wv-wind-text {
  margin: 0;
}
.wv-caveat {
  color: #5f6e77;
  font-weight: 400;
}
.wv-calm {
  margin: 0;
  background: #eef4f6;
  border: 1px solid #b9c6cd;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.875rem;
  max-width: 72ch;
}
</style>
