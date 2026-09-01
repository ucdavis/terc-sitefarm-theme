<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fmtLakeDay, fmtLakeTime } from '../core/time'
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import 'chartjs-adapter-date-fns'

/**
 * The ONLY component that touches Chart.js — swap the charting library here
 * and nothing else changes (same isolation rule as the map engine). Null
 * points break the line (gaps for sentinel / missing readings), which is
 * intentional: gaps are honest, interpolation is not.
 */
Chart.register(LineController, LineElement, PointElement, LinearScale, TimeScale, Tooltip, Legend, Filler)

export interface ChartSeries {
  label: string
  color: string
  points: { x: Date; y: number | null }[]
}

const props = defineProps<{
  series: ChartSeries[]
  unit: string
  title: string
  height?: number
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart<'line'> | null = null

function build() {
  if (!canvas.value) return
  chart?.destroy()
  chart = new Chart(canvas.value, {
    type: 'line',
    data: {
      datasets: props.series.map((s) => ({
        label: s.label,
        data: s.points.map((p) => ({ x: p.x.getTime(), y: p.y })),
        borderColor: s.color,
        backgroundColor: s.color + '22',
        borderWidth: 1.6,
        pointRadius: 0,
        pointHitRadius: 8,
        spanGaps: false,
        tension: 0.2,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: {
          display: props.series.length > 1,
          labels: { boxWidth: 14, boxHeight: 2, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            // Lake time, not viewer-local (TERC-43 display rule): a visitor
            // in New York must see when the reading happened at Tahoe.
            title: (items) =>
              items.length && items[0].parsed.x !== null
                ? `${fmtLakeTime(new Date(items[0].parsed.x))} (lake time)`
                : '',
            label: (ctx) =>
              ` ${ctx.dataset.label}: ${ctx.parsed.y === null ? 'no data' : ctx.parsed.y.toFixed(2)} ${props.unit}`,
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          ticks: {
            maxTicksLimit: 8,
            font: { size: 11 },
            // Axis labels in lake-time days too (the adapter's defaults
            // would render the viewer's timezone).
            callback: (value) => fmtLakeDay(new Date(Number(value))),
          },
          grid: { display: false },
        },
        y: {
          title: { display: true, text: props.unit, font: { size: 11 } },
          ticks: { font: { size: 11 } },
          grid: { color: 'rgba(30,50,70,0.08)' },
        },
      },
    },
  })
}

onMounted(build)
watch(() => props.series, build, { deep: true })
onBeforeUnmount(() => chart?.destroy())

/**
 * Screen-reader text for the canvas-only chart: each series' latest
 * reading with its lake timestamp. Not the full table — thousands of
 * points would drown a reader — but the same "what is it now" answer the
 * visual latest-value chips give sighted visitors.
 */
const srSummary = computed(() => {
  const parts = props.series.map((s) => {
    let last: { x: Date; y: number | null } | undefined
    for (let i = s.points.length - 1; i >= 0; i--) {
      if (s.points[i].y !== null) {
        last = s.points[i]
        break
      }
    }
    return last
      ? `${s.label}: latest ${last.y!.toFixed(1)} ${props.unit} at ${fmtLakeTime(last.x)} lake time`
      : `${s.label}: no data in this range`
  })
  return `${props.title} time-series chart. ${parts.join('. ')}.`
})
</script>

<template>
  <figure class="chart-card">
    <figcaption class="chart-title">{{ title }}</figcaption>
    <div class="chart-box" role="img" :aria-label="srSummary" :style="{ height: (height ?? 220) + 'px' }">
      <canvas ref="canvas" aria-hidden="true" />
    </div>
    <slot name="footer" />
  </figure>
</template>

<style scoped>
.chart-card {
  margin: 0;
  background: #f7fafb;
  border: 1px solid #d5dde2;
  border-radius: 8px;
  padding: 14px 16px;
}
.chart-title {
  font-size: .8125rem;
  font-weight: 600;
  color: #13322b;
  margin-bottom: 8px;
}
.chart-box {
  position: relative;
}
</style>
