<script setup lang="ts">
import { computed, onMounted } from 'vue'
import CacheDiagnostics from './CacheDiagnostics.vue'
import ViewTabs from './ViewTabs.vue'
import type { ViewId } from '../composables/useConditionsState'
import { uniqueId } from '../lib/uniqueId'
import LakeMap from './LakeMap.vue'
import PlanYourDayView from './PlanYourDayView.vue'
import SourceBadge from './SourceBadge.vue'
import WaterQualityView from './WaterQualityView.vue'
import { loadRegistry, syncFromLocation, useConditionsState } from '../composables/useConditionsState'
import { loadConditionBands } from '../data/conditionBands'
import { markerKey, useLakeOverview } from '../composables/useLakeOverview'

/**
 * Current Conditions shell (TERC-18): shared navigation, destination
 * selector, selection state, layout, source badge, and disclaimer for the
 * Phase 1 views: Plan Your Day (TERC-58) and Water Quality (TERC-21). The
 * map region hosts the shared lake map (TERC-17).
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

// Tabs widget wiring (TERC-55). Per-instance ids: the mount layer supports
// several block instances on one page, and duplicated tab/panel ids would
// cross-wire aria-controls / aria-labelledby between them. (Not useId():
// that counter is per Vue app, and each block IS its own app.)
const idBase = uniqueId('cc')
const tabItems = views.map((v) => ({ key: v.id, label: v.label }))
const activeViewLabel = computed(() => views.find((v) => v.id === view.value)?.label ?? '')
function onSelectView(key: string) {
  setView(key as ViewId)
}
/** Announce view switches to assistive tech, as the Phase 2 shell does. */
const viewAnnouncement = computed(() => `${activeViewLabel.value} view selected.`)

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
  // Swap the placeholder condition bands for editor-owned ones (TERC-52).
  void loadConditionBands()
})

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

    <!-- A full ARIA tabs widget (TERC-55): one tab stop, arrow-key roving,
         Home/End, and the panel below labelled by the active tab. Shared
         with the Forecasted Conditions shell. -->
    <ViewTabs
      :tabs="tabItems"
      :model-value="view"
      :id-base="idBase"
      list-label="Current Conditions views"
      variant="underline"
      @update:model-value="onSelectView"
    />

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
    <p class="cc-sr-only" aria-live="polite">{{ viewAnnouncement }}</p>

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

    <!-- One panel container per tab, always present, so every tab's
         aria-controls resolves to a real element (the ViewTabs contract);
         only the active panel is shown and only it mounts content, so the
         inactive view never fetches or renders (PR review finding). -->
    <div
      v-for="v in views"
      v-show="view === v.id"
      :id="`${idBase}-panel-${v.id}`"
      :key="v.id"
      class="cc-view"
      role="tabpanel"
      :aria-labelledby="`${idBase}-tab-${v.id}`"
    >
      <template v-if="view === v.id">
        <h3>{{ v.label }}</h3>
        <WaterQualityView v-if="v.id === 'water-quality'" />
        <PlanYourDayView v-else />
      </template>
    </div>

    <!-- Phase-related placeholder: follows the "Show phase indicator"
         block toggle, so a placement that hides phase chips also hides
         the forward-looking Phase 2 note (TERC-57). -->
    <div v-if="showPhase" class="cc-forecast">
      <h3>Forecasted Conditions</h3>
      <p class="cc-view-stub">Forecast summaries arrive with Phase 2 (TERC-12).</p>
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
/* Sized from SiteFarm's own runtime tokens (responsive, defined by the
   parent theme): the block title steps down to the secondary heading
   size, and view titles use the compact-context title size. Fallbacks
   only apply if the parent theme ever stops defining the tokens. */
.cc-head h2 {
  margin: 0;
  font-size: var(--heading-secondary-font-size, 1.75rem);
  line-height: 1.2;
}
.cc-view h3,
.cc-forecast h3 {
  font-size: var(--reduced-title-font-size, 1.375rem);
  line-height: 1.25;
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
.cc-dest:focus-visible {
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
  font-size: .8125rem;
  color: #4a5a64;
  border-top: 1px solid #d5dde2;
  padding-top: 0.6rem;
}
</style>
