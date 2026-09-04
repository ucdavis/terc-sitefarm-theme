/**
 * Leaflet implementation of the map engine (TERC-17). The ONLY module in the
 * theme that imports Leaflet — swapping map libraries means rewriting this
 * file against engine.ts, nothing else.
 */
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  escapeHtml,
  type BadgeMarkerOpts,
  type CircleMarkerOpts,
  type EngineInitOpts,
  type LatLng,
  type LatLngBounds,
  type MapEngine,
} from './engine'
import { TOOLTIP_GAP, fitTooltipSide, fitTooltipVertical } from './tooltipFit'

/**
 * Re-place a marker's tooltip each time it opens so it stays inside the
 * map frame (TERC-63): pick the side with room, cap the width so the
 * text wraps rather than clips (the unscoped `.leaflet-tooltip` rule in
 * LakeMap.vue allows wrapping), and nudge it clear of the top/bottom
 * edges. Runs for hover and for keyboard focus alike — both open the
 * tooltip through the same event.
 */
function keepTooltipInFrame(marker: L.Marker | L.CircleMarker): void {
  marker.on('tooltipopen', (e) => {
    const tip = (e as L.TooltipEvent).tooltip
    const el = tip.getElement()
    const map = (marker as unknown as { _map?: L.Map })._map
    if (!el || !map) return
    const size = map.getSize()
    const p = map.latLngToContainerPoint(marker.getLatLng())
    el.style.maxWidth = ''
    const fit = fitTooltipSide(p.x, size.x, el.offsetWidth)
    if (fit.maxWidth !== null) el.style.maxWidth = `${fit.maxWidth}px`
    // Height may have changed once the text wrapped.
    const dy = fitTooltipVertical(p.y, size.y, el.offsetHeight)
    tip.options.direction = fit.side
    // Explicit sides do not mirror the offset the way 'auto' does.
    tip.options.offset = L.point(fit.side === 'right' ? TOOLTIP_GAP : -TOOLTIP_GAP, dy)
    tip.update()
  })
}

export function createLeafletEngine(el: HTMLElement, opts: EngineInitOpts): MapEngine {
  const interactive = opts.interactive !== false
  const map = L.map(el, {
    zoomSnap: 0.25,
    zoomControl: interactive,
    scrollWheelZoom: interactive,
    doubleClickZoom: interactive,
    boxZoom: interactive,
    touchZoom: interactive,
    dragging: interactive,
    keyboard: interactive,
  }).setView(opts.center, opts.zoom)
  if (opts.fitBounds) map.fitBounds(opts.fitBounds)
  L.tileLayer(opts.tileUrl, { attribution: opts.attribution, maxZoom: opts.maxZoom }).addTo(map)

  const groups = new Map<string, L.LayerGroup>()
  function group(name: string): L.LayerGroup {
    let g = groups.get(name)
    if (!g) {
      g = L.layerGroup().addTo(map)
      groups.set(name, g)
    }
    return g
  }

  // Badge elements by group, for focus preservation: when a redraw clears
  // the badge that currently holds keyboard focus, the recreated badge with
  // the same id gets focus back instead of dropping the user to <body>.
  const badgeEls = new Map<string, Map<string, HTMLElement>>()
  let refocusId: string | null = null
  const imageOverlays = new Map<string, L.ImageOverlay>()

  return {
    clearGroup(name: string) {
      const els = badgeEls.get(name)
      if (els) {
        for (const [id, badgeEl] of els) {
          if (badgeEl === document.activeElement) refocusId = id
        }
        els.clear()
      }
      group(name).clearLayers()
    },

    addBadgeMarker(name: string, o: BadgeMarkerOpts) {
      // iconSize [0,0] + the badge's own translate(-50%,-50%) centers the
      // HTML chip on the coordinate regardless of its rendered size.
      const icon = L.divIcon({ className: 'terc-badge-anchor', html: o.html, iconSize: [0, 0] })
      // keyboard: true (Leaflet default) makes the badge tab-focusable and
      // fires click on Enter — station focus must not be mouse-only
      // (WCAG 2.1.1). Focus also shows the tooltip in Leaflet 1.9.
      const marker = L.marker([o.lat, o.lng], { icon, keyboard: true })
      if (o.onClick) marker.on('click', o.onClick)
      marker.bindTooltip(o.tooltipHtml, { direction: 'auto', offset: [TOOLTIP_GAP, 0] })
      keepTooltipInFrame(marker)
      group(name).addLayer(marker)
      const el = marker.getElement()
      if (el) {
        el.setAttribute('role', 'button')
        el.setAttribute('aria-label', o.ariaLabel)
        let els = badgeEls.get(name)
        if (!els) badgeEls.set(name, (els = new Map()))
        els.set(o.id, el)
        if (o.id === refocusId) {
          refocusId = null
          el.focus()
        }
        // role=button promises Enter AND Space activation. Handle both
        // ourselves — Leaflet's own Enter handling proved unreliable for
        // divIcon markers (verified live), and depending on it would tie
        // keyboard access to a Leaflet implementation detail.
        el.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            o.onClick?.()
          }
        })
      }
    },

    addCircleMarker(name: string, o: CircleMarkerOpts) {
      const marker = L.circleMarker([o.lat, o.lng], {
        radius: o.radius,
        color: o.color,
        weight: o.weight,
        fillColor: o.fillColor,
        fillOpacity: o.fillOpacity,
      })
      // The contract says tooltip is plain text; Leaflet renders tooltip
      // strings as HTML, so escape here. 'auto' avoids edge clipping.
      marker.bindTooltip(escapeHtml(o.tooltip), { direction: 'auto', offset: [TOOLTIP_GAP, 0] })
      keepTooltipInFrame(marker)
      if (o.onClick) marker.on('click', o.onClick)
      group(name).addLayer(marker)
    },

    flyTo(center: LatLng, zoom: number) {
      map.flyTo(center, zoom, { duration: 0.8 })
    },

    fitBounds(bounds: LatLngBounds) {
      map.fitBounds(bounds)
    },

    invalidateSize() {
      map.invalidateSize()
    },

    setImageOverlay(id: string, url: string, bounds: LatLngBounds, opacity: number) {
      const existing = imageOverlays.get(id)
      if (existing) {
        // Update in place — re-adding would flash the basemap between frames.
        // Bounds too: today every caller reuses LAKE_GRID_BOUNDS, but the
        // contract accepts bounds per call, so an id whose bounds change
        // must not keep the old placement (PR review finding).
        existing.setUrl(url)
        existing.setOpacity(opacity)
        // setBounds (unlike the imageOverlay constructor) narrowly wants a
        // real L.LatLngBounds instance, not the tuple literal form.
        existing.setBounds(L.latLngBounds(bounds))
      } else {
        const overlay = L.imageOverlay(url, bounds, {
          opacity,
          interactive: false,
          className: 'terc-field-overlay',
        }).addTo(map)
        imageOverlays.set(id, overlay)
      }
    },

    removeImageOverlay(id: string) {
      imageOverlays.get(id)?.remove()
      imageOverlays.delete(id)
    },

    destroy() {
      map.remove()
    },
  }
}
