<script setup lang="ts">
import { onMounted } from 'vue'
import SourceBadge from './SourceBadge.vue'
import { syncFromLocation, useConditionsState } from '../composables/useConditionsState'

/**
 * Current Conditions shell (TERC-18): shared navigation, destination
 * selector, selection state, layout, source badge, and disclaimer for the
 * Phase 1 views. The views themselves are stubs filled by their own
 * stories (Plan Your Day, Water Quality TERC-21, extended view), and the
 * map region is the mount slot for the shared lake map (TERC-17).
 */
const {
  view,
  setView,
  views,
  destination,
  destinationId,
  selectDestination,
  focusedStation,
  clearSelection,
  hasSelection,
  destinations,
} = useConditionsState()

onMounted(() => {
  // Restore view + selection from the URL (deep links, page reloads).
  // popstate keeps it in sync with the back button afterwards.
  syncFromLocation()
})

const VIEW_STUB_NOTES: Record<string, string> = {
  'plan-your-day': 'Station cards and lake overview arrive with the Plan Your Day story.',
  'water-quality': 'Location-specific water quality readings arrive with TERC-21.',
  'plan-your-day-extended': 'All six water metrics per station arrive with the extended view story.',
}
</script>

<template>
  <section class="cc-shell">
    <header class="cc-head">
      <h2>Lake Tahoe Current Conditions</h2>
      <SourceBadge :phase="1" :sources="['tepfsail50 REST API']" />
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

    <div class="cc-map-region" data-terc-map-slot>
      <!-- Shared lake map mounts here (TERC-17). -->
      <p class="cc-map-placeholder">
        Interactive lake map coming here.
        <template v-if="destination"> Selected destination: <strong>{{ destination.name }}</strong>.</template>
        <template v-else-if="focusedStation"> Focused station: <strong>{{ focusedStation.name || `${focusedStation.kind} ${focusedStation.sourceId}` }}</strong>.</template>
        <template v-else> Showing the whole lake.</template>
      </p>
    </div>

    <div class="cc-view" role="region" :aria-label="views.find((v) => v.id === view)?.label">
      <h3>{{ views.find((v) => v.id === view)?.label }}</h3>
      <p class="cc-view-selection">
        <template v-if="destination">For {{ destination.name }}.</template>
        <template v-else-if="focusedStation">For station {{ focusedStation.name || focusedStation.sourceId }}.</template>
        <template v-else>For the whole lake — pick a destination above.</template>
      </p>
      <p class="cc-view-stub">{{ VIEW_STUB_NOTES[view] }}</p>
    </div>

    <div class="cc-forecast">
      <h3>Forecasted Conditions</h3>
      <p class="cc-view-stub">Modeled conditions summaries arrive with Phase 2 (TERC-12).</p>
    </div>

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
.cc-map-region {
  min-height: 120px;
  background: #eef4f7;
  border: 1px dashed #b9c6cd;
  border-radius: 6px;
  display: grid;
  place-items: center;
}
.cc-map-placeholder,
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
