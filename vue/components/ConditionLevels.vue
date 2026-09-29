<script setup lang="ts">
import { computed, ref } from 'vue'
import { bandChipStyle } from '../config/brandPalette'
import { METRIC_META, metricBands, type Band, type QualityMetric } from '../config/qualitative'

/**
 * "What do these levels mean?" — the whole interpretation scale, not just
 * the level a reading happens to be in right now (TERC-95).
 *
 * A station card shows one chip: "Cool". That tells a visitor nothing about
 * what the other levels are, where this one starts and ends, or how many
 * there are. This panel lays every metric's bands out in order, with the
 * same chip, its numeric range, and the editor's own sentence.
 *
 * Collapsed by default: it is reference material, and the cards above are
 * what people come for. It reads whatever bands are in force — editor-owned
 * condition_bands when the site has them, the built-in fallback otherwise —
 * so it always describes the thresholds actually being applied.
 */
const METRICS = Object.keys(METRIC_META) as QualityMetric[]

const open = ref(false)
const panelId = `cl-panel-${Math.random().toString(36).slice(2, 9)}`

/** Trailing zeros carry no meaning in a threshold: 0.50 -> "0.5", 50 -> "50". */
const fmt = (n: number) => String(Number(n.toFixed(3)))

/**
 * A band's range in words. Bands are ordered ascending and `max` is
 * exclusive, so a band starts where the previous one ended; the last one is
 * open-ended (Infinity) and must read as such rather than as a number.
 */
function range(bands: Band[], i: number, unit: string): string {
  const lower = i === 0 ? null : bands[i - 1].max
  const upper = bands[i].max
  if (lower === null) return `Below ${fmt(upper)} ${unit}`
  if (!Number.isFinite(upper)) return `${fmt(lower)} ${unit} and above`
  return `${fmt(lower)}–${fmt(upper)} ${unit}`
}

const tables = computed(() =>
  METRICS.map((metric) => {
    const bands = metricBands(metric)
    const meta = METRIC_META[metric]
    return {
      metric,
      meta,
      rows: bands.map((band, i) => ({ band, range: range(bands, i, meta.unit) })),
    }
  }).filter((t) => t.rows.length > 0),
)
</script>

<template>
  <section class="cl">
    <button
      type="button"
      class="cl-toggle"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      {{ open ? 'Hide what these levels mean' : 'What do these levels mean?' }}
    </button>
    <div v-show="open" :id="panelId" class="cl-panel">
      <p class="cl-intro">
        Every reading is given a level. These are all the levels, from lowest
        to highest, and the range each one covers.
      </p>
      <table v-for="t in tables" :key="t.metric" class="cl-table">
        <caption>{{ t.meta.label }}</caption>
        <thead>
          <tr>
            <th scope="col">Level</th>
            <th scope="col">Range</th>
            <th scope="col">What it means</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in t.rows" :key="row.band.label">
            <td>
              <!-- The label is inside the chip, so the level is never
                   carried by color alone. -->
              <span class="cl-chip" :style="bandChipStyle(row.band)">{{ row.band.label }}</span>
            </td>
            <td class="cl-range">{{ row.range }}</td>
            <td>{{ row.band.sentence }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.cl {
  margin-top: 0.4rem;
}
.cl-toggle {
  font: inherit;
  font-size: .8125rem;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 99px;
  border: 1px solid #1c6b45;
  background: #fff;
  color: #1c6b45;
  cursor: pointer;
}
.cl-toggle[aria-expanded='true'] {
  background: #1c6b45;
  color: #fff;
}
.cl-toggle:focus-visible {
  outline: 3px solid #f0b323;
  outline-offset: 2px;
}
.cl-panel {
  margin-top: 0.8rem;
  display: grid;
  gap: 1.2rem;
}
.cl-intro {
  margin: 0;
  font-size: .875rem;
  color: #4a5a64;
  max-width: 72ch;
}
.cl-table {
  border-collapse: collapse;
  width: 100%;
  max-width: 62rem;
  font-size: .875rem;
}
.cl-table caption {
  text-align: left;
  font-weight: 700;
  padding-bottom: 0.3rem;
}
.cl-table th,
.cl-table td {
  text-align: left;
  vertical-align: top;
  padding: 6px 12px 6px 0;
  border-bottom: 1px solid #dde3e6;
}
.cl-table th {
  font-size: .75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #4a5a64;
}
.cl-chip {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 99px;
  font-weight: 600;
  white-space: nowrap;
  background: var(--band-bg);
  color: var(--band-fg);
}
.cl-range {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
