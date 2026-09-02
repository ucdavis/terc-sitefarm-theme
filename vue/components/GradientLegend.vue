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

const ticks = computed(() => {
  const { min, max, stops } = props.scale
  const n = props.variant === 'panel' ? stops.length : 5
  return Array.from({ length: n }, (_, i) => fmtTick(max - ((max - min) * i) / (n - 1)))
})

const groupLabel = computed(
  () =>
    `${props.scale.name} color scale, from ${fmtTick(props.scale.min)} to ${fmtTick(props.scale.max)} ${props.scale.unit}`,
)
</script>

<template>
  <div class="legend" :class="`legend--${variant}`" role="group" :aria-label="groupLabel">
    <div class="legend-title">{{ scale.name }}</div>
    <div class="legend-body">
      <div class="legend-bar" :style="{ background: gradient }" aria-hidden="true" />
      <div class="legend-ticks">
        <span v-for="(t, i) in ticks" :key="i">{{ t }}<em v-if="variant === 'panel'"> {{ scale.unit }}</em></span>
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
.legend-ticks em {
  font-style: normal;
  color: #5f6e77;
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
