/**
 * Scalar-field image rendering (TERC-23) — grid values to a north-aligned
 * PNG data URL the map engine can place over LAKE_GRID_BOUNDS.
 *
 * Two stages, because the model domain is ROTATED ~1.85° from true north
 * (see lakeGrid.ts) while image overlays only accept a north-aligned
 * rectangle:
 *
 *   1. Paint the grid one pixel per cell, honouring the grid's own row
 *      order (NaN → transparent, giving the lake silhouette).
 *   2. Draw that image, rotated, into a larger canvas covering the domain's
 *      north-aligned bounding box, and hand THAT to the engine.
 *
 * Doing the rotation ourselves keeps the engine's simple bounds API and
 * avoids a rotated-overlay plugin. Handles any grid resolution — 174×102
 * model grids and the 695×406 wave grid. Rendering stays smoothed,
 * matching the reference site.
 *
 * `fieldPixels` is pure (no DOM) so the per-cell math — flips, NaN alpha,
 * color mapping — is unit-testable; only `renderFieldImage` touches canvas.
 */
import { LAKE_DOMAIN, LAKE_DOMAIN_AABB } from '../config/lakeGrid'
import { scaleColor, type ColorScale } from '../core/colorScale'
import type { ScalarGrid } from '../data/gridDecode'

/** RGBA pixels for the grid, row 0 = north (flips applied). Pure. */
export function fieldPixels(grid: ScalarGrid, scale: ColorScale): Uint8ClampedArray {
  const { rows, cols, values, flipVertical, flipHorizontal } = grid
  const out = new Uint8ClampedArray(rows * cols * 4)
  for (let r = 0; r < rows; r++) {
    const srcRow = flipVertical ? rows - 1 - r : r
    for (let c = 0; c < cols; c++) {
      const srcCol = flipHorizontal ? cols - 1 - c : c
      const v = values[srcRow * cols + srcCol]
      const o = (r * cols + c) * 4
      if (Number.isNaN(v)) {
        out[o + 3] = 0 // outside the lake -> transparent (lake silhouette)
      } else {
        const [red, green, blue] = scaleColor(scale, v)
        out[o] = red
        out[o + 1] = green
        out[o + 2] = blue
        out[o + 3] = 255
      }
    }
  }
  return out
}

/**
 * Full render to a PNG data URL, or null where canvas 2D is unavailable
 * (non-browser test environments) — callers treat null as "nothing to show".
 */
export function renderFieldImage(grid: ScalarGrid, scale: ColorScale): string | null {
  const { rows, cols } = grid

  // Stage 1 — one pixel per grid cell, in the grid's own (rotated) frame.
  // After the flips, this canvas's "up" is always grid-north.
  const cellCanvas = document.createElement('canvas')
  cellCanvas.width = cols
  cellCanvas.height = rows
  const cellCtx = cellCanvas.getContext('2d')
  if (!cellCtx) return null
  const img = cellCtx.createImageData(cols, rows)
  img.data.set(fieldPixels(grid, scale))
  cellCtx.putImageData(img, 0, 0)

  // Stage 2 — rotate into a north-aligned canvas covering the domain's
  // bounding box. Resolution oversamples the grid 2× so the rotation doesn't
  // visibly stair-step beyond the grid's own cell size.
  const metresPerCell = LAKE_DOMAIN.heightM / rows
  const metresPerPx = metresPerCell / 2
  const outW = Math.ceil((2 * LAKE_DOMAIN_AABB.halfWidthM) / metresPerPx)
  const outH = Math.ceil((2 * LAKE_DOMAIN_AABB.halfHeightM) / metresPerPx)

  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const ctx = out.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.translate(outW / 2, outH / 2)
  // Canvas y points down, so a positive ctx.rotate is clockwise. rotationDeg
  // is CCW-positive in map terms, hence the negation: a negative rotationDeg
  // (grid-north tilting east) becomes a clockwise image rotation.
  ctx.rotate((-LAKE_DOMAIN.rotationDeg * Math.PI) / 180)
  ctx.drawImage(
    cellCanvas,
    -LAKE_DOMAIN.widthM / metresPerPx / 2,
    -LAKE_DOMAIN.heightM / metresPerPx / 2,
    LAKE_DOMAIN.widthM / metresPerPx,
    LAKE_DOMAIN.heightM / metresPerPx,
  )

  return out.toDataURL('image/png')
}
