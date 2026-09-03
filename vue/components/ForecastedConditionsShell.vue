<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Component } from 'vue'
import CacheDiagnostics from './CacheDiagnostics.vue'
import DateHourSelector from './DateHourSelector.vue'
import SourceBadge from './SourceBadge.vue'
import CurrentsView from './CurrentsView.vue'
import ViewTabs, { type ViewTab } from './ViewTabs.vue'
import WaterTemperatureView from './WaterTemperatureView.vue'
import WaveHeightView from './WaveHeightView.vue'
import { useModelTime } from '../composables/useModelTime'
import { fmtLakeTime } from '../core/time'
import { uniqueId } from '../lib/uniqueId'

/**
 * Forecasted Conditions shell (TERC-22): the wrapper for the Phase 2
 * modeled views — lake-wide map stage, the shared date/hour selector with
 * "Next 24 h" playback, ARIA-tabs navigation between views that preserves
 * the selected time (useModelTime is a singleton), and the link back to
 * Real-Time Conditions.
 *
 * Navigation renders from the VIEWS registry rather than assuming a fixed
 * set — Weather and UV/Air Quality arrive in later phases and simply
 * aren't registered yet. Each registered view owns its own map stage and
 * data loader; the shell owns only the time selection they share.
 */
const props = withDefaults(
  defineProps<{
    showSources?: boolean | number | string
    debug?: boolean | number | string
    /** Path of the Phase 1 block's page, for the cross-link. */
    realTimePath?: string
  }>(),
  { showSources: true, debug: false, realTimePath: '/real-time-conditions' },
)

function asBool(v: boolean | number | string): boolean {
  return v === true || v === 1 || v === '1'
}

const showSources = asBool(props.showSources)
const showDiagnostics = asBool(props.debug)

interface ViewDef extends ViewTab {
  /** One-line visitor-facing description shown in the panel. */
  blurb: string
  component: Component
}

const VIEWS: ViewDef[] = [
  {
    key: 'water-temperature',
    label: 'Water Temperature',
    blurb:
      'Lake-wide forecasted surface temperature. The lake is not one temperature — cold upwellings can chill a shoreline overnight.',
    component: WaterTemperatureView,
  },
  {
    key: 'currents',
    label: 'Currents',
    blurb:
      'Forecasted water movement across the lake, including the gyres and rip currents that matter to swimmers and paddleboarders.',
    component: CurrentsView,
  },
  {
    key: 'wave-height',
    label: 'Wave Height',
    blurb: 'Forecasted wave heights driven by the wind forecast, lake-wide.',
    component: WaveHeightView,
  },
]

const activeKey = ref(VIEWS[0].key)
const activeView = computed(() => VIEWS.find((v) => v.key === activeKey.value) ?? VIEWS[0])

// Per-instance id base: the mount layer supports several block instances on
// one page, and duplicated tab/panel ids would cross-wire aria-controls /
// aria-labelledby between them (PR review finding). A page-level counter
// rather than useId(): each placeholder mounts as its OWN Vue app
// (lib/mount.ts), and useId only dedupes within one app — see lib/uniqueId.
const idBase = uniqueId('fc')

const { selectedFrame, manifestError, ensureManifest } = useModelTime()
// The shell loads the manifest itself rather than relying on whichever
// view happens to be active: the date/hour selector is the shell's own
// chrome and must never sit empty. Views join the same singleton, so this
// costs no extra request.
void ensureManifest()

const heading = computed(() => `Lake Tahoe Forecasted Conditions`)
const frameCaption = computed(() =>
  selectedFrame.value
    ? `${activeView.value.label} for ${fmtLakeTime(selectedFrame.value.time)} (lake time)`
    : `${activeView.value.label}`,
)

/** Announce view switches to assistive tech (same pattern as Phase 1). */
const viewAnnouncement = computed(() => `${activeView.value.label} view selected.`)
</script>

<template>
  <section class="fc-shell">
    <header class="fc-head">
      <h2 class="fc-heading">{{ heading }}</h2>
      <SourceBadge
        :phase="2"
        :sources="[
          'lake-tahoe-conditions S3 (model grids)',
          'api.weather.gov (wind forecast)',
        ]"
        :show-phase="false"
        :show-sources="showSources"
      />
    </header>
    <p class="fc-intro">
      Model-based forecasts of lake conditions, updated daily. Pick a date and
      hour — your selection follows you between views — or press
      “Next&nbsp;24&nbsp;h” to watch conditions evolve.
    </p>

    <ViewTabs
      v-model="activeKey"
      :tabs="VIEWS"
      :id-base="idBase"
      list-label="Forecasted conditions views"
    />
    <span class="fc-sr-only" aria-live="polite">{{ viewAnnouncement }}</span>

    <DateHourSelector class="fc-selector" />

    <p v-if="manifestError" class="fc-error" role="alert">
      The forecast index could not be loaded right now ({{ manifestError }}).
      Selection and playback are unavailable until it loads — real-time
      conditions are unaffected.
      <button class="fc-retry" type="button" @click="ensureManifest()">Try again</button>
    </p>

    <div
      v-for="v in VIEWS"
      v-show="v.key === activeKey"
      :id="`${idBase}-panel-${v.key}`"
      :key="v.key"
      role="tabpanel"
      :aria-labelledby="`${idBase}-tab-${v.key}`"
      class="fc-panel"
    >
      <p class="fc-caption">{{ frameCaption }}</p>
      <p class="fc-blurb">{{ v.blurb }}</p>
      <!-- Only the active view mounts: each brings its own map, and an
           offscreen one would fetch grids nobody is looking at. -->
      <component :is="v.component" v-if="v.key === activeKey" />
    </div>

    <p class="fc-realtime">
      Looking for what's happening right now?
      <a :href="realTimePath">See Real-Time Conditions</a> — live readings from
      the lake's monitoring stations.
    </p>

    <CacheDiagnostics v-if="showDiagnostics" />
  </section>
</template>

<style scoped>
.fc-shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.fc-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.fc-heading {
  font-size: var(--heading-secondary-font-size, 1.75rem);
  margin: 0;
}
.fc-intro {
  margin: 0;
  color: #5f6e77;
  max-width: 62ch;
}
.fc-selector {
  align-self: flex-start;
}
.fc-error {
  margin: 0;
  background: #fdecea;
  border: 1px solid #f2b8ae;
  color: #8f2a16;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 0.875rem;
}
.fc-retry {
  font: inherit;
  font-weight: 600;
  margin-left: 8px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid #8f2a16;
  background: #fff;
  color: #8f2a16;
  cursor: pointer;
}
.fc-retry:focus-visible {
  outline: 3px solid #f0b323;
  outline-offset: 2px;
}
.fc-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.fc-caption {
  margin: 0;
  font-weight: 600;
}
.fc-blurb {
  margin: 0;
  color: #5f6e77;
  max-width: 70ch;
}
.fc-realtime {
  margin: 0;
  font-size: 0.9375rem;
}
.fc-realtime a {
  color: #1d5b68;
  font-weight: 600;
}
.fc-realtime a:focus-visible {
  outline: 3px solid #f0b323;
  outline-offset: 2px;
}
.fc-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>
