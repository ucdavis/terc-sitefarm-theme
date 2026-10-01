<script setup lang="ts">
import { computed } from 'vue'
import { scaleGradientCss, type ColorScale } from '../core/colorScale'

/**
 * Legend driven by the SAME ColorScale object the renderer uses (TERC-23),
 * so they can never disagree. Two variants:
 *  - 'floating': compact card pinned to the map's top-right corner.
 *  - 'panel': large figure-style colorbar placed BESIDE the map, one labeled
 *    tick per color stop (like a matplotlib colorbar).
 *
 * The gradient bar is decorative to assistive tech (the tick labels carry
 * the information); the group announces itself as the scale's legend.
 */
const props = withDefaults(
  defineProps<{ scale: ColorScale; variant?: 'floating' | 'panel' }>(),
  { variant: 'floating' },
)

const gradient = computed(() => scaleGradientCss(props.scale))

function fmtTick(v: number): string {
  const span = props.scale.max - props.scale.min
  return span >= 20 ? String(Math.round(v)) : v.toFixed(1)
}

/** The same value in the scale's second unit, parenthesised (TERC-100). */
function fmtSecond(v: number): string | null {
  const s = props.scale.secondary
  return s ? `(${(v * s.perPrimary).toFixed(s.digits)} ${s.unit})` : null
}

/**
 * Tick labels, top of the bar first.
 *
 * The unit is built into the string rather than written as template text
 * beside an interpolation: Vue's whitespace condensing drops a leading space
 * inside an inline tag, which is why the panel colorbar used to read
 * "100ft/min" (TERC-100).
 */
const ticks = computed(() => {
  const { min, max, stops, unit } = props.scale
  const panel = props.variant === 'panel'
  const n = panel ? stops.length : 5
  return Array.from({ length: n }, (_, i) => {
    const v = max - ((max - min) * i) / (n - 1)
    // The compact floating card names its unit once, in the footer below
    // the bar, so its ticks stay bare numbers.
    return {
      primary: panel ? `${fmtTick(v)} ${unit}` : fmtTick(v),
      second: panel ? fmtSecond(v) : null,
    }
  })
})

/** An end of the scale in words — both units when the scale has two. */
function describeEnd(v: number): string {
  const second = fmtSecond(v)
  return `${fmtTick(v)} ${props.scale.unit}${second ? ` ${second}` : ''}`
}

const groupLabel = computed(
  () =>
    `${props.scale.name} color scale, from ${describeEnd(props.scale.min)} to ${describeEnd(props.scale.max)}`,
)
</script>

<template>
  <div class="legend" :class="`legend--${variant}`" role="group" :aria-label="groupLabel">
    <div class="legend-title">{{ scale.name }}</div>
    <div class="legend-body">
      <div class="legend-bar" :style="{ background: gradient }" aria-hidden="true" />
      <div class="legend-ticks">
        <span v-for="(t, i) in ticks" :key="i">
          <span class="legend-tick-value">{{ t.primary }}</span>
          <small v-if="t.second" class="legend-tick-second">{{ t.second }}</small>
        </span>
      </div>
    </div>
    <div v-if="variant === 'floating'" class="legend-unit">{{ scale.unit }}</div>
  </div>
</template>

<style scoped>
.legend {
  color: #22343c;
}
.legend-title {
  font-weight: 600;
  margin-bottom: 6px;
  line-height: 1.25;
}
.legend-body {
  display: flex;
  gap: 8px;
}
.legend-bar {
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.15);
}
.legend-ticks {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #5f6e77;
  font-variant-numeric: tabular-nums;
}
/* A number and its unit are one label: never broken across lines by the
   84px colorbar column. */
.legend-tick-value {
  display: block;
  white-space: nowrap;
}
/* Second unit under the first, never beside it: the colorbar column is
   84-110px wide and two numbers do not fit on one line at any of its
   sizes. Same ink as the primary tick (5.3:1 on white, AA) — size and the
   parentheses carry the hierarchy, not a lighter grey that would fail. */
.legend-tick-second {
  display: block;
  font-size: 0.6875rem;
  line-height: 1.15;
  white-space: nowrap;
  color: #5f6e77;
}
/* Phones: the colorbar is 84px wide and 417px tall, and twelve two-line
   ticks fill 404px of it — about a pixel between one tick and the next,
   which reads as a wall of numbers rather than as twelve labels. The second
   unit drops out at this size; the readout below the map still gives both
   units for the values that matter. Measured at 320px, not guessed. */
@media (max-width: 899px) {
  .legend-tick-second {
    display: none;
  }
}

/* Compact card pinned inside the map. */
.legend--floating {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 800;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #d5dde2;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 0.75rem;
  box-shadow: 0 1px 4px rgba(20, 40, 60, 0.12);
}
.legend--floating .legend-title {
  max-width: 110px;
}
.legend--floating .legend-bar {
  width: 14px;
  height: 150px;
}
.legend-unit {
  margin-top: 6px;
  color: #5f6e77;
}

/* Large figure-style colorbar beside the map. */
.legend--panel {
  display: flex;
  flex-direction: column;
  font-size: 0.8125rem;
  padding: 4px 0;
}
.legend--panel .legend-title {
  font-size: 0.875rem;
  margin-bottom: 10px;
}
.legend--panel .legend-body {
  flex: 1;
  gap: 10px;
}
.legend--panel .legend-bar {
  width: 26px;
  height: 100%;
}
</style>
