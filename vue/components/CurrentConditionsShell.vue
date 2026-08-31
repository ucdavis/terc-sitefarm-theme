<script setup lang="ts">
import { computed, onMounted } from 'vue'
import CacheDiagnostics from './CacheDiagnostics.vue'
import LakeMap from './LakeMap.vue'
import SourceBadge from './SourceBadge.vue'
import WaterQualityView from './WaterQualityView.vue'
import { loadRegistry, syncFromLocation, useConditionsState } from '../composables/useConditionsState'
import { markerKey, useLakeOverview } from '../composables/useLakeOverview'

/**
 * Current Conditions shell (TERC-18): shared navigation, destination
 * selector, selection state, layout, source badge, and disclaimer for the
 * Phase 1 views. The views themselves are stubs filled by their own
 * stories (Plan Your Day, Water Quality TERC-21, extended view). The map
 * region hosts the shared lake map (TERC-17).
 */
/**
 * Block-form toggles (PDB configuration -> props, same pattern as
 * HelloLake): checkbox values arrive as 0/1 or '0'/'1'; absent means the
 * block predates the option, so each falls back to its form default.
 */
const props = withDefaults(
  defineProps<{
    showPhase?: boolean | number | string
    showSources?: boolean | number | string
    debug?: boolean | number | string
  }>(),
  { showPhase: true, showSources: true, debug: false },
)

function asBool(v: boolean | number | string): boolean {
  return v === true || v === 1 || v === '1'
}
const showPhase = asBool(props.showPhase)
const showSources = asBool(props.showSources)
const showDiagnostics = asBool(props.debug)

const {
  view,
  setView,
  views,
  destination,
  destinationId,
  selectDestination,
  focusedStation,
  focusStation,
  clearSelection,
  hasSelection,
  destinations,
} = useConditionsState()

const { markers } = useLakeOverview()

const focusedStationKey = computed(() =>
  focusedStation.value ? markerKey(focusedStation.value.kind, focusedStation.value.sourceId) : null,
)

/** A station badge click on the map becomes a single-station focus. */
function onSelectStation(key: string) {
  const m = markers.value.find((x) => x.key === key)
  if (m) focusStation({ kind: m.kind, sourceId: m.sourceId, name: m.name })
}

/**
 * Polite live announcement of selection changes for screen-reader users —
 * a map badge or destination click otherwise changes half the page
 * silently.
 */
const selectionAnnouncement = computed(() => {
  if (focusedStation.value)
    return `Focused on station ${focusedStation.value.name || focusedStation.value.sourceId}.`
  if (destination.value) return `Showing ${destination.value.name}.`
  return 'Showing the whole lake.'
})

/**
 * The block heading names the current selection, so the page says where
 * you are without hunting for the highlighted pill. Names come from the
 * registry (site content, TERC-46) — the heading follows editor renames.
 */
const heading = computed(() => {
  const base = 'Lake Tahoe Current Conditions'
  if (destination.value) return `${base} for ${destination.value.name}`
  if (focusedStation.value)
    return `${base} at ${focusedStation.value.name || `station ${focusedStation.value.sourceId}`}`
  return base
})

onMounted(() => {
  // Restore view + selection from the URL (deep links, page reloads).
  // popstate keeps it in sync with the back button afterwards.
  syncFromLocation()
  // Swap the static registry for site content (Lake Destinations, TERC-46).
  void loadRegistry()
})

/** Views still awaiting their own stories render a stub note instead. */
const VIEW_STUB_NOTES: Record<string, string> = {
  'plan-your-day':
    "Station cards with a 'show more data' toggle arrive with the Plan Your Day story.",
}
</script>

<template>
  <section class="cc-shell">
    <header class="cc-head">
      <h2>{{ heading }}</h2>
      <SourceBadge
        v-if="showPhase || showSources"
        :phase="1"
        :sources="['tepfsail50 REST API']"
        :show-phase="showPhase"
        :show-sources="showSources"
      />
    </header>

    <nav class="cc-nav" aria-label="Current Conditions views">
      <button
        v-for="v in views"
        :key="v.id"
        type="button"
        class="cc-tab"
        :class="{ active: view === v.id }"
        :aria-current="view === v.id ? 'page' : undefined"
        @click="setView(v.id)"
      >
        {{ v.label }}
      </button>
    </nav>

    <div class="cc-selector">
      <span class="cc-selector-label">Where are you going?</span>
      <div class="cc-dest-buttons">
        <button
          v-for="d in destinations"
          :key="d.id"
          type="button"
          class="cc-dest"
          :class="{ active: destinationId === d.id }"
          :aria-pressed="destinationId === d.id"
          @click="selectDestination(d.id)"
        >
          {{ d.name }}
        </button>
        <button
          v-if="hasSelection"
          type="button"
          class="cc-dest cc-reset"
          @click="clearSelection"
        >
          Show whole lake
        </button>
      </div>
    </div>

    <p class="cc-sr-only" aria-live="polite">{{ selectionAnnouncement }}</p>

    <div class="cc-map-region" data-terc-map-slot>
      <LakeMap
        :destinations="destinations"
        :selected-destination-id="destinationId"
        :overview-markers="markers"
        :focused-station-key="focusedStationKey"
        @select-destination="selectDestination"
        @select-station="onSelectStation"
      />
    </div>

    <div class="cc-view" role="region" :aria-label="views.find((v) => v.id === view)?.label">
      <h3>{{ views.find((v) => v.id === view)?.label }}</h3>
      <WaterQualityView v-if="view === 'water-quality'" />
      <template v-else>
        <p class="cc-view-selection">
          <template v-if="destination">For {{ destination.name }}.</template>
          <template v-else-if="focusedStation">For station {{ focusedStation.name || focusedStation.sourceId }}.</template>
          <template v-else>For the whole lake — pick a destination above.</template>
        </p>
        <p class="cc-view-stub">{{ VIEW_STUB_NOTES[view] }}</p>
      </template>
    </div>

    <div class="cc-forecast">
      <h3>Forecasted Conditions</h3>
      <p class="cc-view-stub">Modeled conditions summaries arrive with Phase 2 (TERC-12).</p>
    </div>

    <CacheDiagnostics v-if="showDiagnostics" />

    <footer class="cc-disclaimer">
      All data are provisional, subject to revision, and provided for research
      and demonstration purposes only — not for navigation, safety-of-life
      decisions, or official use. Data: TERC near-shore network · NOAA/NWS
      Reno.
    </footer>
  </section>
</template>

<style scoped>
.cc-shell {
  border: 1px solid #d5dde2;
  border-radius: 6px;
  padding: 1rem 1.25rem;
  display: grid;
  gap: 0.9rem;
}
.cc-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  flex-wrap: wrap;
}
.cc-head h2 {
  margin: 0;
}
.cc-nav {
  display: flex;
  gap: 0.25rem;
  border-bottom: 2px solid #d5dde2;
}
.cc-tab {
  border: 0;
  background: none;
  padding: 0.5rem 0.9rem;
  cursor: pointer;
  font-weight: 600;
  color: #4a5a64;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
}
.cc-tab.active {
  color: #13322b;
  border-bottom-color: #1c6b45;
}
.cc-selector-label {
  font-weight: 700;
  margin-right: 0.5rem;
}
.cc-dest-buttons {
  display: inline-flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.cc-dest {
  border: 1px solid #b9c6cd;
  background: #fff;
  border-radius: 99px;
  padding: 0.3rem 0.8rem;
  cursor: pointer;
}
.cc-dest.active {
  background: #1c6b45;
  border-color: #1c6b45;
  color: #fff;
}
.cc-reset {
  border-style: dashed;
}
/* Keyboard focus must be clearly visible on every control (WCAG 2.4.7);
   don't rely on the browser default surviving theme CSS. */
.cc-dest:focus-visible,
.cc-tab:focus-visible {
  outline: 3px solid #f0b323;
  outline-offset: 2px;
}
/* Visually hidden, still announced (live region). */
.cc-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.cc-view-stub {
  color: #4a5a64;
  font-style: italic;
}
.cc-view h3,
.cc-forecast h3 {
  margin: 0 0 0.3rem;
}
.cc-disclaimer {
  font-size: 12px;
  color: #4a5a64;
  border-top: 1px solid #d5dde2;
  padding-top: 0.6rem;
}
</style>
