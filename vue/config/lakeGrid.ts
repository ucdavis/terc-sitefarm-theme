/**
 * Georeference and orientation for the modeled grid domain (TERC-38).
 *
 * Ported from the prototype's lakeBounds.ts, minus its Leaflet type import —
 * bounds here are plain [lat, lng] tuples so this module stays inside the
 * library seam (Leaflet types live only in vue/map/).
 *
 * ⚠ THE DOMAIN IS ROTATED relative to true north, so it cannot be described
 * by a north-aligned lat/lon rectangle. Earlier axis-aligned fits are why the
 * prototype's overlay never quite sat on the shoreline: the edges could be
 * made to line up, but then the middle drifted (worst in the south, where the
 * field spilled over land by several hundred metres).
 *
 * SOLVED (2026-07-31) by image registration, not by nudging numbers:
 * rasterised OpenStreetMap's Lake Tahoe polygon (820,676 cells ≈ 497 km²
 * against the lake's actual ~496 km²) and searched centre, cell size, and
 * rotation to maximise intersection-over-union with each grid's water mask.
 *
 *   axis-aligned, previous bounds .......... IoU 0.9221
 *   axis-aligned, best possible ............ IoU 0.9517  <- ceiling without rotation
 *   rotated, values below .................. IoU 0.9958
 *
 * Four things say this is real rather than overfitting:
 *  1. The temperature (.npy, 174×102) and STWAVE (JSON, 695×406) grids —
 *     different producers, formats, and resolutions — independently land on
 *     the same ~−1.8° rotation (wave IoU 0.9901 at −1.75°).
 *  2. Cell size falls out at 199.1 m × 200.0 m, i.e. a clean 200 m domain.
 *     Nothing in the search forced a round number.
 *  3. −1.85° matches the UTM zone 10N meridian convergence at Tahoe to within
 *     0.01°: (−120.05 + 123) × sin 39.09° ≈ 1.86°. That is exactly the tilt
 *     you get from building a model grid in UTM and drawing it on true north,
 *     which is almost certainly what happened.
 *  4. The optimum is sharp — ±1° of rotation costs ~0.02 IoU.
 *
 * ASSUMPTION: the model's water mask covers the same extent as OSM's lake
 * polygon. If TERC publishes an authoritative georeference (ideally the UTM
 * zone, origin, and cell size), use it — it supersedes this registration and
 * would let us drop the empirical rotation entirely.
 */

export type LatLngTuple = [number, number]
export type BoundsTuple = [LatLngTuple, LatLngTuple]

export const LAKE_DOMAIN = {
  centerLat: 39.09363,
  centerLon: -120.04734,
  /** Extent along the grid's OWN axes, metres. */
  heightM: 34650, // grid north–south (174 rows × 199.1 m)
  widthM: 20400, // grid east–west  (102 cols × 200.0 m)
  /**
   * Grid-north relative to true north, degrees, counter-clockwise positive.
   * Negative means grid-north tilts EAST — the UTM convergence signature.
   */
  rotationDeg: -1.85,
} as const

const M_PER_DEG_LAT = 110540
const M_PER_DEG_LON = 111320 * Math.cos((LAKE_DOMAIN.centerLat * Math.PI) / 180)

/** Half-extent of the ROTATED domain's north-aligned bounding box, in metres. */
function rotatedHalfExtent() {
  const a = (LAKE_DOMAIN.rotationDeg * Math.PI) / 180
  const c = Math.abs(Math.cos(a))
  const s = Math.abs(Math.sin(a))
  return {
    halfWidthM: (LAKE_DOMAIN.widthM * c + LAKE_DOMAIN.heightM * s) / 2,
    halfHeightM: (LAKE_DOMAIN.widthM * s + LAKE_DOMAIN.heightM * c) / 2,
  }
}

export const LAKE_DOMAIN_AABB = rotatedHalfExtent()

/**
 * North-aligned bounding box that CONTAINS the rotated domain. The overlay
 * canvas is drawn pre-rotated and placed over this box, since image overlays
 * only accept axis-aligned bounds. Also used to fit the map.
 */
export const LAKE_GRID_BOUNDS: BoundsTuple = [
  [
    LAKE_DOMAIN.centerLat - LAKE_DOMAIN_AABB.halfHeightM / M_PER_DEG_LAT,
    LAKE_DOMAIN.centerLon - LAKE_DOMAIN_AABB.halfWidthM / M_PER_DEG_LON,
  ],
  [
    LAKE_DOMAIN.centerLat + LAKE_DOMAIN_AABB.halfHeightM / M_PER_DEG_LAT,
    LAKE_DOMAIN.centerLon + LAKE_DOMAIN_AABB.halfWidthM / M_PER_DEG_LON,
  ],
]

/** Default map view for the Forecasted Conditions shell. */
export const LAKE_CENTER: LatLngTuple = [39.09, -120.04]
export const LAKE_DEFAULT_ZOOM = 10

/**
 * Grid orientation. Rows = latitude, cols = longitude for both producers
 * (174 > 102 and 695 > 406 both match Tahoe's N–S elongation).
 *
 * ⚠ THE TWO PRODUCERS DISAGREE ON ROW ORDER. Orientation therefore travels
 * with each grid (`ScalarGrid.flipVertical`) instead of being one global
 * constant the renderer applies to everything.
 *
 * --- .npy model grids (temperature, flow) ---
 * FINDING (2026-07-29): row 0 is the SOUTH edge, col 0 is WEST. Determined by
 * fitting each row's non-NaN span to shoreline anchors: rows 40/130 match
 * Rubicon Point (−120.11 @ 39.00) and Tahoe City (−120.14 @ 39.17) only in
 * this orientation, and the 10-cell tip at row 173 lands on Stateline Point.
 * Canvas paints row 0 at the top (north), so these must be flipped.
 */
export const GRID_FLIP_VERTICAL = true
export const GRID_FLIP_HORIZONTAL = false

/**
 * --- STWAVE wave-height grids (695×406 JSON) ---
 * FINDING (2026-07-31): row 0 is the NORTH edge — the OPPOSITE of the .npy
 * grids — so these must NOT be flipped. Applying the model grids' flip
 * rendered the wave field upside down on the lake (reported visually, then
 * confirmed numerically).
 *
 * Method: resampled each grid's per-row water-width profile to 24 bins and
 * correlated the wave profile against the already-calibrated temperature
 * profile. Same order → r = +0.800; wave reversed → r = +0.997. The lake's
 * north–south width asymmetry is pronounced enough that the reversed match
 * is unambiguous.
 */
export const WAVE_GRID_FLIP_VERTICAL = false
export const WAVE_GRID_FLIP_HORIZONTAL = false
