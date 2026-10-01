<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { bandChipStyle } from '../config/brandPalette'
import { METRIC_META, metricBands, type Band } from '../config/qualitative'
import { useVisibleMetrics } from '../composables/useVisibleMetrics'
import { uniqueId } from '../lib/uniqueId'

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
 *
 * It covers the measurements the active view is actually showing, not all
 * eight (TERC-103): the view declares them, this reads the declaration.
 */
const metrics = useVisibleMetrics()

const open = ref(false)
// Page-wide, not per-app: one Vue app per block placeholder means useId (or
// a per-component counter) would cross-wire two blocks' aria-controls. See
// lib/uniqueId.
const panelId = uniqueId('cl-panel')

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

/**
 * Which tables actually overflow their box right now.
 *
 * A scroll container must be keyboard-reachable so it can be scrolled
 * without a mouse (WCAG 2.1.1) — but only when there is something to
 * scroll. Making all eight focusable unconditionally would add eight dead
 * tab stops on a desktop, where every table fits. Measured, not guessed at
 * from a breakpoint, because the width that matters is the container's.
 */
const overflowing = ref<Record<string, boolean>>({})
const els = new Map<string, HTMLElement>()
let observer: ResizeObserver | null = null

function measure(metric: string) {
  const el = els.get(metric)
  if (el) overflowing.value[metric] = el.scrollWidth > el.clientWidth + 1
}

function registerScroller(metric: string, el: unknown) {
  const node = el as HTMLElement | null
  if (!node) {
    els.delete(metric)
    observer?.disconnect()
    for (const e of els.values()) observer?.observe(e)
    return
  }
  els.set(metric, node)
  // ResizeObserver is in every browser this theme supports; without it the
  // containers simply stay unfocusable rather than breaking.
  if (typeof ResizeObserver !== 'undefined') {
    observer ??= new ResizeObserver(() => {
      for (const key of els.keys()) measure(key)
    })
    observer.observe(node)
  }
  measure(metric)
}

onBeforeUnmount(() => observer?.disconnect())

// Opening the panel is when the tables first have a size to measure.
watch(open, (isOpen) => {
  if (isOpen) requestAnimationFrame(() => els.forEach((_, key) => measure(key)))
})

/**
 * What the closed button promises (TERC-95 follow-up): a strip of the real
 * chip colors, plus counts. "What do these levels mean?" alone does not say
 * whether one level or thirty are behind it, or that they are color-coded.
 * The swatches are the actual band colors, so the preview cannot claim a
 * palette the panel does not show.
 */
const previewSwatches = computed(() =>
  tables.value.flatMap((t) => t.rows.map((row) => bandChipStyle(row.band))).slice(0, 12),
)
const levelCount = computed(() => tables.value.reduce((n, t) => n + t.rows.length, 0))

const tables = computed(() =>
  metrics.value.map((metric) => {
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
      <span>{{ open ? 'Hide what these levels mean' : 'What do these levels mean?' }}</span>
      <!-- Decorative: the counts beside the button say the same thing in
           words, so a screen reader is not read a row of empty swatches. -->
      <span v-if="!open" class="cl-swatches" aria-hidden="true">
        <span v-for="(style, i) in previewSwatches" :key="i" class="cl-swatch" :style="style" />
      </span>
    </button>
    <span v-if="!open" class="cl-hint">
      {{ levelCount }} levels across {{ tables.length }} measurements, and what each one means.
    </span>
    <div v-show="open" :id="panelId" class="cl-panel">
      <p class="cl-intro">
        Every reading is given a level. These are all the levels for the
        measurements shown here, from lowest to highest, and the range each
        one covers.
      </p>
      <!-- Each table scrolls on its own below ~400px rather than stretching
           the page (WCAG 1.4.10 reflow): a data table is two-dimensional by
           nature, so it may scroll sideways, but the PAGE may not. The
           container is focusable and labelled so a keyboard user can scroll
           it and a screen reader announces what it is (WCAG 2.1.1). -->
      <div
        v-for="t in tables"
        :key="t.metric"
        :ref="(el) => registerScroller(t.metric, el)"
        class="cl-scroll"
        :tabindex="overflowing[t.metric] ? 0 : undefined"
        :role="overflowing[t.metric] ? 'group' : undefined"
        :aria-label="overflowing[t.metric] ? `${t.meta.label} levels` : undefined"
      >
        <table class="cl-table">
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
    </div>
  </section>
</template>

<style scoped>
.cl {
  margin-top: 0.4rem;
}
.cl-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
.cl-swatches {
  display: inline-flex;
  gap: 3px;
}
.cl-swatch {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  /* The chip's own background, with its text color as the rim so a pale
     band still reads as a distinct dot. */
  background: var(--band-bg);
  border: 1px solid var(--band-fg);
}
.cl-hint {
  /* Its own line: in the 480px map column it would otherwise wrap mid
     sentence around the button. */
  display: block;
  margin-top: 6px;
  font-size: .8125rem;
  color: #4a5a64;
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
.cl-scroll {
  overflow-x: auto;
  max-width: 62rem;
}
.cl-scroll:focus-visible {
  outline: 3px solid #f0b323;
  outline-offset: 2px;
}
.cl-table {
  border-collapse: collapse;
  width: 100%;
  font-size: .875rem;
}
/* Enough room for a sentence to read as one, without forcing the page
   wider than the viewport. */
.cl-table td:last-child {
  min-width: 14rem;
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
  font-variant-numeric: tabular-nums;
}
</style>
