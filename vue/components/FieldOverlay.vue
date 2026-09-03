<script setup lang="ts">
import { inject, onBeforeUnmount, watch, type ShallowRef } from 'vue'
import { LAKE_GRID_BOUNDS } from '../config/lakeGrid'
import type { ColorScale } from '../core/colorScale'
import type { ScalarGrid } from '../data/gridDecode'
import { MAP_ENGINE_INJECTION_KEY, type MapEngine } from '../map/engine'
import { renderFieldUrl } from '../map/fieldRenderer'

/**
 * Renders a scalar grid as an image overlay on the hosting LakeMap
 * (TERC-23). Renderless: it draws through the map-engine seam LakeMap
 * provides — unlike the prototype, it never imports a map library.
 * Updates in place on frame change so hour-stepping never flashes.
 */
const props = withDefaults(
  defineProps<{ grid: ScalarGrid | null; scale: ColorScale; opacity?: number }>(),
  // Fully opaque: the field IS the subject, and any translucency washes the
  // colors into the light basemap (worst on low wave heights).
  { opacity: 1 },
)

const OVERLAY_ID = 'scalar-field'
const engineRef = inject<ShallowRef<MapEngine | null> | null>(MAP_ENGINE_INJECTION_KEY, null)

// Rendering is async now (it may run in the grid worker, TERC-47), so a
// fast step or a playback tick can outrun an earlier render. Only the
// newest request may touch the map (non-negotiable #6).
let renderGen = 0

async function render() {
  const engine = engineRef?.value
  if (!engine) return
  const gen = ++renderGen
  if (!props.grid) {
    engine.removeImageOverlay(OVERLAY_ID)
    return
  }
  let url: string | null
  try {
    url = await renderFieldUrl(props.grid, props.scale)
  } catch (e) {
    // Only the newest render may act on failure, too: a superseded one
    // erroring must not tear down the frame that replaced it.
    if (gen !== renderGen) return
    // A render that failed outright must not leave the PREVIOUS frame on
    // the map looking current (PR review finding).
    engineRef?.value?.removeImageOverlay(OVERLAY_ID)
    console.warn('[terc] field overlay render failed', e)
    return
  }
  if (gen !== renderGen) return
  const live = engineRef?.value
  if (!live) return
  if (url) {
    live.setImageOverlay(OVERLAY_ID, url, LAKE_GRID_BOUNDS, props.opacity)
  } else {
    // Canvas unavailable (or render failed): don't leave the PREVIOUS
    // frame's image on the map looking current (PR review finding).
    live.removeImageOverlay(OVERLAY_ID)
  }
}

watch(() => [props.grid, props.scale, props.opacity, engineRef?.value], render, {
  immediate: true,
})

onBeforeUnmount(() => {
  engineRef?.value?.removeImageOverlay(OVERLAY_ID)
})
</script>

<template><span hidden /></template>

<style>
/* Deliberate: smoothed rendering to match the reference implementation.
   Switch to `image-rendering: pixelated` to inspect raw cells. */
.terc-field-overlay {
  image-rendering: auto;
}
</style>
