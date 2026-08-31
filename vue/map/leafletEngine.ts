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

  // Badge elements by group, for focus preservation: when a redraw clears
  // the badge that currently holds keyboard focus, the recreated badge with
  // the same id gets focus back instead of dropping the user to <body>.
  const badgeEls = new Map<string, Map<string, HTMLElement>>()
  let refocusId: string | null = null

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
      // direction 'auto' places the tooltip on the side away from the map
      // edge, so badges near the boundary don't get their tooltip clipped
      // by the map container's overflow (fixed-'top' did).
      marker.bindTooltip(o.tooltipHtml, { direction: 'auto', offset: [14, 0] })
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
      marker.bindTooltip(escapeHtml(o.tooltip), { direction: 'auto', offset: [10, 0] })
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
