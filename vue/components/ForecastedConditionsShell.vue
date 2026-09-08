<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Component } from 'vue'
import CacheDiagnostics from './CacheDiagnostics.vue'
import EndpointDiagnostics from './EndpointDiagnostics.vue'
import { enableRequestLog } from '../core/requestLog'
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
    /** Show the endpoint diagnostics panel (TERC-62). */
    endpointDiagnostics?: boolean | number | string
    /** Path of the Phase 1 block's page, for the cross-link. */
    realTimePath?: string
    /**
     * Editor-owned copy (TERC-9): the intro under the heading and one text
     * per view, shown beside that view's panel. Plain text; blank lines
     * separate paragraphs. Defaults are the copy the views shipped with.
     */
    introText?: string
    waterTemperatureText?: string
    currentsText?: string
    waveHeightText?: string
  }>(),
  {
    showSources: true,
    debug: false,
    endpointDiagnostics: false,
    realTimePath: '/real-time-conditions',
    introText:
      'Model-based forecasts of lake conditions, updated daily. Pick a date and hour — your selection follows you between views — or press “Next 24 h” to watch conditions evolve.',
    waterTemperatureText:
      'Lake-wide forecasted surface temperature. The lake is not one temperature — cold upwellings can chill a shoreline overnight.\n\n' +
      'The lake is never one temperature — wind can pull deep, cold water to the surface overnight (an upwelling), chilling a shoreline that was comfortable the day before. Even on warm days, water below the surface layer stays dangerously cold — sudden immersion can cause cold-water shock. Enter gradually, stay close to shore, and wear a life vest on any craft.',
    currentsText:
      'Forecasted water movement across the lake, including the gyres and rip currents that matter to swimmers and paddleboarders.\n\n' +
      "Lake Tahoe's water is always moving. Large, slow gyres circulate the whole lake, and wind pushes surface water toward shore where it returns as fast, narrow outflows, the same rip currents that catch swimmers and paddleboarders off guard. Fast water is invisible from the beach: check here before you go in, stay close to shore, and wear a life vest on any craft.",
    waveHeightText:
      'Forecasted wave heights driven by the wind forecast, lake-wide.\n\n' +
      'Waves here are driven by wind: how hard it blows, how far it blows across open water (the fetch), and how deep that water is. The same wind builds much bigger waves on a long, exposed shore than in a sheltered bay, which is why the east and south shores can be rough while the west shore stays calm.',
  },
)

/** Plain text -> paragraphs: blank lines separate, stray whitespace dropped. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}
const introParagraphs = computed(() => paragraphs(props.introText))
const viewTexts = computed<Record<string, string[]>>(() => ({
  'water-temperature': paragraphs(props.waterTemperatureText),
  currents: paragraphs(props.currentsText),
  'wave-height': paragraphs(props.waveHeightText),
}))

function asBool(v: boolean | number | string): boolean {
  return v === true || v === 1 || v === '1'
}

const showSources = asBool(props.showSources)
const showDiagnostics = asBool(props.debug)
const showEndpoints = asBool(props.endpointDiagnostics)
// Before any child mounts and starts fetching, so the first requests are logged too.
if (showEndpoints) enableRequestLog()

interface ViewDef extends ViewTab {
  component: Component
}

/** The visitor-facing text for each view lives in the block form — see
 *  the *Text props — so this registry is only key, label, and component. */
const VIEWS: ViewDef[] = [
  { key: 'water-temperature', label: 'Water Temperature', component: WaterTemperatureView },
  { key: 'currents', label: 'Currents', component: CurrentsView },
  { key: 'wave-height', label: 'Wave Height', component: WaveHeightView },
]

/**
 * Deep-linkable view (TERC-12): ?fc-view=currents opens that view, the
 * same way ?cc-view= does on the Real-Time page. Kiosk shortcuts and the
 * QR posters (TERC-59) need a URL that lands on a specific layer. The
 * default — no param, or an unknown one — is Water Temperature, per the
 * ticket's definition of done.
 */
const PARAM_VIEW = 'fc-view'
function viewFromLocation(): string {
  const requested = new URLSearchParams(window.location.search).get(PARAM_VIEW)
  return VIEWS.some((v) => v.key === requested) ? (requested as string) : VIEWS[0].key
}
const activeKey = ref(viewFromLocation())
const activeView = computed(() => VIEWS.find((v) => v.key === activeKey.value) ?? VIEWS[0])

/** The page URL describing `key` — no param for the default view. */
function urlForView(key: string): URL {
  const url = new URL(window.location.href)
  if (key === VIEWS[0].key) url.searchParams.delete(PARAM_VIEW)
  else url.searchParams.set(PARAM_VIEW, key)
  return url
}

// History discipline, matching the Real-Time page (useConditionsState):
//  - a user's tab choice PUSHES, so Back walks the views they visited;
//  - an unknown ?fc-view= is REPLACED away on mount, so the URL never
//    describes something other than what's shown, without adding an entry;
//  - popstate only reads — writing there would clobber the entry the
//    browser just restored.
function onSelectView(key: string) {
  if (key === activeKey.value) return
  activeKey.value = key
  window.history.pushState(null, '', urlForView(key))
}
const normalised = urlForView(activeKey.value)
if (normalised.href !== window.location.href) window.history.replaceState(window.history.state, '', normalised)

onMounted(() => {
  const onPop = () => {
    activeKey.value = viewFromLocation()
  }
  window.addEventListener('popstate', onPop)
  onBeforeUnmount(() => window.removeEventListener('popstate', onPop))
})

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
    <div class="fc-intro">
      <p v-for="(p, i) in introParagraphs" :key="i">{{ p }}</p>
    </div>

    <ViewTabs
      :model-value="activeKey"
      :tabs="VIEWS"
      @update:model-value="onSelectView"
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
      <!-- Only the active view mounts: each brings its own map, and an
           offscreen one would fetch grids nobody is looking at. The
           editor-owned description and safety copy (TERC-9) travels into
           the view's reading column beside the map (TERC-64). -->
      <component :is="v.component" v-if="v.key === activeKey">
        <template #side>
          <aside
            v-if="viewTexts[v.key]?.length"
            class="fc-panel-aside"
            :aria-label="`About ${v.label}`"
          >
            <p v-for="(p, i) in viewTexts[v.key]" :key="i">{{ p }}</p>
          </aside>
        </template>
      </component>
    </div>

    <p class="fc-realtime">
      Looking for what's happening right now?
      <a :href="realTimePath">See Real-Time Conditions</a> — live readings from
      the lake's monitoring stations.
    </p>

    <CacheDiagnostics v-if="showDiagnostics" />
    <EndpointDiagnostics v-if="showEndpoints" />
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
  color: #5f6e77;
  max-width: 62ch;
}
.fc-intro p {
  margin: 0 0 0.5rem;
}
.fc-intro p:last-child {
  margin-bottom: 0;
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
/* Panel = caption + the view; the view lays out its own map column and
   reading column (FieldStage, TERC-64) — the same split as Real-Time. */
.fc-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.fc-panel-aside {
  padding: 0.9rem 1.1rem;
  border: 1px solid #d5dde2;
  border-radius: 8px;
  background: #f6f9fa;
  color: #22343c;
}
.fc-panel-aside p {
  margin: 0 0 0.75rem;
}
.fc-panel-aside p:last-child {
  margin-bottom: 0;
}
.fc-caption {
  margin: 0;
  font-weight: 600;
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
