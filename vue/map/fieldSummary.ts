/**
 * Plain-text spatial summaries of a scalar field (TERC-23) — the text
 * alternative WCAG requires for the canvas field-overlay layer. A map's
 * essential information is spatial distribution, not just its numeric
 * range, so this names WHERE the extremes occur rather than only what they
 * are (PR review finding). Shared by every field view (TERC-23/24/25) so
 * the phrasing and the region math stay in one place.
 *
 * Pure — no DOM — so it can be unit-tested directly against grid fixtures.
 */
import type { ScalarGrid } from '../data/gridDecode'

/** Geographic row (0 = north), independent of the grid's storage order. */
function geoRow(grid: ScalarGrid, storageIndex: number): number {
  const sr = Math.floor(storageIndex / grid.cols)
  return grid.flipVertical ? grid.rows - 1 - sr : sr
}

/** Geographic column (0 = west), independent of the grid's storage order. */
function geoCol(grid: ScalarGrid, storageIndex: number): number {
  const sc = storageIndex % grid.cols
  return grid.flipHorizontal ? grid.cols - 1 - sc : sc
}

/** A short place name for a cell — "the north shore", "the middle of the
 *  lake" — using the same row/col orientation the field renderer paints. */
export function regionLabel(grid: ScalarGrid, storageIndex: number): string {
  const third = (pos: number, span: number) => Math.min(2, Math.floor((pos / span) * 3))
  const ns = ['north', '', 'south'][third(geoRow(grid, storageIndex), grid.rows)]
  const ew = ['west', '', 'east'][third(geoCol(grid, storageIndex), grid.cols)]
  if (ns && ew) return `the ${ns}${ew} shore`
  if (ns) return `the ${ns} end of the lake`
  if (ew) return `the ${ew} shore`
  return 'the middle of the lake'
}

export interface FieldExtent {
  min: number
  max: number
  minIndex: number
  maxIndex: number
}

/** The finite value range of a grid and where each extreme occurs, or
 *  null when every cell is NaN (outside the lake, or no data modeled). */
export function fieldExtent(grid: ScalarGrid): FieldExtent | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let minIndex = -1
  let maxIndex = -1
  const { values } = grid
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (Number.isNaN(v)) continue
    if (v < min) {
      min = v
      minIndex = i
    }
    if (v > max) {
      max = v
      maxIndex = i
    }
  }
  return minIndex === -1 ? null : { min, max, minIndex, maxIndex }
}

/**
 * A full sentence describing a field's range and location for screen
 * reader users — the text alternative for the map image. Returns null for
 * an all-NaN grid; callers render an explicit "no data" state for that
 * case rather than treating null as "say nothing" (honesty rule).
 */
export function describeFieldExtent(
  grid: ScalarGrid,
  subject: string,
  fmt: (v: number) => string,
): string | null {
  const extent = fieldExtent(grid)
  if (!extent) return null
  const { min, max, minIndex, maxIndex } = extent
  if (min === max) return `${subject} is about ${fmt(min)} across the lake at this hour.`
  return `${subject} ranges from about ${fmt(min)} near ${regionLabel(grid, minIndex)} to about ${fmt(max)} near ${regionLabel(grid, maxIndex)} at this hour.`
}
