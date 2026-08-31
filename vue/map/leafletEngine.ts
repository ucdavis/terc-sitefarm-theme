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
  type MapEngine,
} from './engine'

export function createLeafletEngine(el: HTMLElement, opts: EngineInitOpts): MapEngine {
  const map = L.map(el, { zoomSnap: 0.25 }).setView(opts.center, opts.zoom)
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

  return {
    clearGroup(name: string) {
      group(name).clearLayers()
    },

    addBadgeMarker(name: string, o: BadgeMarkerOpts) {
      // iconSize [0,0] + the badge's own translate(-50%,-50%) centers the
      // HTML chip on the coordinate regardless of its rendered size.
      const icon = L.divIcon({ className: 'terc-badge-anchor', html: o.html, iconSize: [0, 0] })
      const marker = L.marker([o.lat, o.lng], { icon, keyboard: false })
      if (o.onClick) marker.on('click', o.onClick)
      marker.bindTooltip(o.tooltipHtml, { direction: 'top', offset: [0, -14] })
      group(name).addLayer(marker)
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
      // strings as HTML, so escape here.
      marker.bindTooltip(escapeHtml(o.tooltip), { direction: 'top', offset: [0, -8] })
      if (o.onClick) marker.on('click', o.onClick)
      group(name).addLayer(marker)
    },

    flyTo(center: LatLng, zoom: number) {
      map.flyTo(center, zoom, { duration: 0.8 })
    },

    destroy() {
      map.remove()
    },
  }
}
