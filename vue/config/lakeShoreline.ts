/**
 * OpenStreetMap's Lake Tahoe polygon (relation 1823287), simplified to a 10 m
 * tolerance: ring 0 is the lake, the rest are islands.
 *
 * Two uses, which is why it ships rather than living in a test fixture:
 *  - stationCoordinates.test.ts checks every station sits in open water
 *    (TERC-79);
 *  - fieldImage clips the forecast overlay to it (TERC-102), so the lake's
 *    edge follows the real coast instead of the model's 200 m cells.
 *
 * It is a SHAPE, not a georeference: the model's own water mask decides which
 * cells carry values. Registration between the two is ~0.996 IoU (lakeGrid.ts),
 * so the clip trims at most a fraction of a cell along the shore.
 */
import shoreline from './lakeShoreline.json'

/** [lng, lat] pairs — GeoJSON order, as OSM exports them. */
export type ShorelineRing = [number, number][]

export const LAKE_SHORELINE_RINGS = shoreline.rings as ShorelineRing[]
