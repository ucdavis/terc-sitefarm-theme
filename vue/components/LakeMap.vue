<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { DestinationDef } from '../config/destinations'
import { LAKE_CENTER, LAKE_DEFAULT_ZOOM, STATION_FOCUS_ZOOM, TILE_LAYERS, type BasemapId } from '../config/lakeView'
import { escapeHtml, type MapEngine, type MapEngineFactory } from '../map/engine'
import { createLeafletEngine } from '../map/leafletEngine'
import type { OverviewMarker } from '../composables/useLakeOverview'

/**
 * The shared interactive Lake Tahoe map (TERC-17). Renders every registry
 * station as a badge with its latest water temperature — non-reporting
 * stations stay on the map as distinct offline markers — plus selectable
 * destination dots. Purely presentational: state comes in as props, clicks
 * go out as events, and the hosting view (the Current Conditions shell
 * today, Phase 2 views later) owns the selection.
 *
 * All map-library calls go through the engine seam (map/engine.ts); tests
 * and future library swaps supply a different `engineFactory`.
 */
const props = withDefaults(
  defineProps<{
    destinations?: DestinationDef[]
    selectedDestinationId?: string | null
    /** All-lake station badges (value chip when reporting, "!" when not). */
    overviewMarkers?: OverviewMarker[]
    /** Key of the station badge currently focused (kind:sourceId). */
    focusedStationKey?: string | null
    height?: string
    basemap?: BasemapId
    engineFactory?: MapEngineFactory
  }>(),
  {
    destinations: () => [],
    selectedDestinationId: null,
    overviewMarkers: () => [],
    focusedStationKey: null,
    height: '460px',
    basemap: 'streets',
    engineFactory: undefined,
  },
)

const emit = defineEmits<{
  (e: 'select-destination', id: string): void
  (e: 'select-station', key: string): void
}>()

const container = ref<HTMLElement | null>(null)
const engine = shallowRef<MapEngine | null>(null)

function drawOverview() {
  const eng = engine.value
  if (!eng) return
  eng.clearGroup('overview')
  for (const m of props.overviewMarkers) {
    if (m.status === 'loading') continue
    const reporting = m.status === 'reporting' && m.waterTemp !== null
    const focused = m.key === props.focusedStationKey ? ' stn-badge--focused' : ''
    const html = reporting
      ? `<div class="stn-badge${m.kind === 'buoy' ? ' stn-badge--buoy' : ''}${focused}">${m.waterTemp!.toFixed(1)}</div>`
      : `<div class="stn-badge stn-badge--offline${focused}">!</div>`
    const when = m.time
      ? m.time.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : null
    const parts = [
      // Names come from site content / the live API — escape, never trust.
      `<strong>${escapeHtml(m.name)}</strong>${m.kind === 'buoy' ? ' (mid-lake buoy)' : ''}`,
      reporting ? `Water ${m.waterTemp!.toFixed(1)} °F · ${when}` : 'Not reporting — station may be under maintenance',
      m.locationVerified ? '' : 'Location approximate',
      "<em>Click for this station's readings</em>",
    ].filter(Boolean)
    eng.addBadgeMarker('overview', {
      lat: m.lat,
      lng: m.lng,
      html,
      tooltipHtml: parts.join('<br>'),
      onClick: () => emit('select-station', m.key),
    })
  }
}

function drawDestinations() {
  const eng = engine.value
  if (!eng) return
  eng.clearGroup('destinations')
  for (const d of props.destinations) {
    const isSelected = d.id === props.selectedDestinationId
    eng.addCircleMarker('destinations', {
      lat: d.lat,
      lng: d.lng,
      radius: isSelected ? 11 : 8,
      color: isSelected ? '#0e6ba8' : '#3d5a6c',
      weight: 2,
      fillColor: isSelected ? '#0e6ba8' : '#ffffff',
      fillOpacity: isSelected ? 0.85 : 0.7,
      tooltip: d.name,
      onClick: () => emit('select-destination', d.id),
    })
  }
}

onMounted(() => {
  if (!container.value) return
  const factory = props.engineFactory ?? createLeafletEngine
  const tiles = TILE_LAYERS[props.basemap]
  // Open on the selection already in state (deep link, reload, or a host
  // view mounting the map after state sync) — a focused station wins over a
  // destination, matching their mutual exclusion; otherwise the whole lake.
  const focused = props.focusedStationKey
    ? props.overviewMarkers.find((m) => m.key === props.focusedStationKey)
    : undefined
  const preselected = focused
    ? undefined
    : props.destinations.find((d) => d.id === props.selectedDestinationId)
  engine.value = factory(container.value, {
    center: focused ? [focused.lat, focused.lng] : preselected ? [preselected.lat, preselected.lng] : LAKE_CENTER,
    zoom: focused ? STATION_FOCUS_ZOOM : preselected ? preselected.zoom : LAKE_DEFAULT_ZOOM,
    tileUrl: tiles.url,
    attribution: tiles.attribution,
    maxZoom: 17,
  })
  drawDestinations()
  drawOverview()
})

watch(
  () => [props.destinations, props.selectedDestinationId],
  () => drawDestinations(),
  { deep: true },
)
watch(() => props.overviewMarkers, drawOverview, { deep: true })

watch(
  () => props.focusedStationKey,
  (key) => {
    drawOverview() // re-render badges so the focus ring moves
    const m = props.overviewMarkers.find((x) => x.key === key)
    if (m) engine.value?.flyTo([m.lat, m.lng], STATION_FOCUS_ZOOM)
    // Focus cleared with no destination selected -> back to the whole lake.
    else if (!key && !props.selectedDestinationId) resetView()
  },
)

watch(
  () => props.selectedDestinationId,
  (id) => {
    const d = props.destinations.find((x) => x.id === id)
    if (d) engine.value?.flyTo([d.lat, d.lng], d.zoom)
    // Cleared selection with no station focus -> back to the whole lake.
    else if (!props.focusedStationKey) resetView()
  },
)

function resetView() {
  engine.value?.flyTo(LAKE_CENTER, LAKE_DEFAULT_ZOOM)
}
defineExpose({ resetView })

onBeforeUnmount(() => {
  engine.value?.destroy()
  engine.value = null
})
</script>

<template>
  <div class="lake-map-wrap">
    <div ref="container" class="lake-map" :style="{ height }" />
    <slot />
  </div>
</template>

<style scoped>
.lake-map-wrap {
  position: relative;
}
.lake-map {
  width: 100%;
  border-radius: 8px;
  border: 1px solid #d5dde2;
  z-index: 0;
}
</style>

<!-- Unscoped: badge HTML is injected by the map engine outside Vue's scope. -->
<style>
.terc-badge-anchor {
  background: none;
  border: none;
}
.stn-badge {
  position: absolute;
  transform: translate(-50%, -50%);
  background: #1d5b68;
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  padding: 6px 10px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  box-shadow: 0 1px 4px rgba(10, 30, 40, 0.35);
  white-space: nowrap;
  cursor: pointer;
}
.stn-badge:hover {
  filter: brightness(1.15);
}
.stn-badge--focused {
  outline: 3px solid #f0b323;
  outline-offset: 1px;
}
.stn-badge--buoy {
  background: #14475e;
}
.stn-badge--offline {
  background: #8c1f17;
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}
</style>
