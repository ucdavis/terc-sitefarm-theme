<script setup lang="ts">
import { inject, onBeforeUnmount, watch, type ShallowRef } from 'vue'
import { LAKE_GRID_BOUNDS } from '../config/lakeGrid'
import type { ColorScale } from '../core/colorScale'
import type { ScalarGrid } from '../data/gridDecode'
import { MAP_ENGINE_INJECTION_KEY, type MapEngine } from '../map/engine'
import { renderFieldImage } from '../map/fieldImage'

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

function render() {
  const engine = engineRef?.value
  if (!engine) return
  if (!props.grid) {
    engine.removeImageOverlay(OVERLAY_ID)
    return
  }
  const url = renderFieldImage(props.grid, props.scale)
  if (url) engine.setImageOverlay(OVERLAY_ID, url, LAKE_GRID_BOUNDS, props.opacity)
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
