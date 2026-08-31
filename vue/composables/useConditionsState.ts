import { computed, ref } from 'vue'
import { DESTINATIONS, destinationById, type DestinationDef } from '../config/destinations'

/**
 * Shared Current Conditions selection state (TERC-18).
 *
 * Module scope makes these singletons page-wide: every block importing this
 * module (the shell, later the map and data views) sees one selection, and
 * switching internal views never resets it. The active view and selection
 * are mirrored into the URL query string so links are shareable, the back
 * button walks view history, and a full page load restores the selection.
 *
 * Prefixed params (cc-*) keep clear of Drupal's own query parameters.
 */

export const VIEWS = [
  { id: 'plan-your-day', label: 'Plan Your Day' },
  { id: 'water-quality', label: 'Water Quality' },
  { id: 'plan-your-day-extended', label: 'Plan Your Day +' },
] as const

export type ViewId = (typeof VIEWS)[number]['id']

const PARAM_VIEW = 'cc-view'
const PARAM_DEST = 'cc-dest'
const PARAM_STATION = 'cc-station'

/** A station focused by clicking its map marker; serialized as kind:id. */
export interface StationFocus {
  kind: 'nearshore' | 'buoy' | 'homewood'
  sourceId: number
  name: string
}

const view = ref<ViewId>('plan-your-day')
const destinationId = ref<string | null>(null)
const focusedStation = ref<StationFocus | null>(null)

function isViewId(v: string | null): v is ViewId {
  return VIEWS.some((x) => x.id === v)
}

/** Read state out of the current URL. Call once on shell mount. */
export function syncFromLocation(): void {
  const q = new URLSearchParams(window.location.search)
  const v = q.get(PARAM_VIEW)
  view.value = isViewId(v) ? v : 'plan-your-day'
  const dest = q.get(PARAM_DEST)
  destinationId.value = dest && destinationById(dest) ? dest : null
  const st = q.get(PARAM_STATION)
  if (st) {
    const m = st.match(/^(nearshore|buoy|homewood):(-?\d+)(?::(.*))?$/)
    focusedStation.value = m
      ? { kind: m[1] as StationFocus['kind'], sourceId: +m[2], name: m[3] ?? '' }
      : null
    if (focusedStation.value) destinationId.value = null
  } else {
    focusedStation.value = null
  }
}

function writeUrl(push: boolean): void {
  const q = new URLSearchParams(window.location.search)
  q.set(PARAM_VIEW, view.value)
  if (destinationId.value) q.delete(PARAM_STATION)
  destinationId.value ? q.set(PARAM_DEST, destinationId.value) : q.delete(PARAM_DEST)
  focusedStation.value
    ? q.set(
        PARAM_STATION,
        `${focusedStation.value.kind}:${focusedStation.value.sourceId}:${focusedStation.value.name}`,
      )
    : q.delete(PARAM_STATION)
  const url = `${window.location.pathname}?${q.toString()}${window.location.hash}`
  if (push) window.history.pushState(null, '', url)
  else window.history.replaceState(null, '', url)
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => syncFromLocation())
}

export function useConditionsState() {
  /** Switch internal view — a pushState so the back button walks views. */
  function setView(v: ViewId) {
    if (v === view.value) return
    view.value = v
    writeUrl(true)
  }

  /** Destination and single-station focus are mutually exclusive. */
  function selectDestination(id: string) {
    if (!destinationById(id)) return
    destinationId.value = id
    focusedStation.value = null
    writeUrl(false)
  }

  function focusStation(s: StationFocus) {
    focusedStation.value = s
    destinationId.value = null
    writeUrl(false)
  }

  /** "Show whole lake": no destination, no station. */
  function clearSelection() {
    destinationId.value = null
    focusedStation.value = null
    writeUrl(false)
  }

  const destination = computed<DestinationDef | null>(() =>
    destinationId.value ? (destinationById(destinationId.value) ?? null) : null,
  )
  const hasSelection = computed(
    () => destinationId.value !== null || focusedStation.value !== null,
  )

  return {
    view,
    setView,
    destinationId,
    destination,
    selectDestination,
    focusedStation,
    focusStation,
    clearSelection,
    hasSelection,
    destinations: DESTINATIONS,
    views: VIEWS,
  }
}
