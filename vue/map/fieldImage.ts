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
 * model grids and the 695×406 wave grid.
 *
 * RESOLUTION (TERC-102). The model grid is 200 m per cell, so painting one
 * pixel per cell produced a ~216×354 PNG that the map then stretched across
 * ~1200 device pixels — a 5-6x enlargement the browser filled in with blur,
 * over a shoreline stair-stepped at 200 m. Three things fix that, none of
 * which invents detail the model did not produce:
 *
 *   - sample at TARGET_M_PER_PX instead of per cell, so the browser is not
 *     enlarging the image at all;
 *   - interpolate the VALUES between cell centres (bilinear) rather than
 *     painting flat blocks and letting the browser blur them;
 *   - clip the result to the real shoreline, so the lake's edge is the
 *     coast rather than the grid.
 *
 * `fieldPixels` is pure (no DOM) so the sampling math — flips, NaN alpha,
 * interpolation — is unit-testable; only the render functions touch canvas.
 */
import { LAKE_DOMAIN, LAKE_DOMAIN_AABB, M_PER_DEG_LAT, M_PER_DEG_LON } from '../config/lakeGrid'
import { LAKE_SHORELINE_RINGS } from '../config/lakeShoreline'
import { scaleColor, type ColorScale } from '../core/colorScale'
import type { ScalarGrid } from '../data/gridDecode'

/**
 * Metres per pixel to render at. 25 m keeps the overlay sharp at the zooms
 * the lake is framed at, for both grids: the 200 m model grid supersamples
 * 8x, the 50 m wave grid 2x, and each lands near 860×1420 px — big enough
 * that the map never enlarges it, small enough to encode per frame during
 * "Next 24 h" playback.
 */
export const TARGET_M_PER_PX = 25

/** How many samples per cell edge this grid needs to reach TARGET_M_PER_PX. */
export function supersampleFactor(grid: ScalarGrid): number {
  const metresPerCell = LAKE_DOMAIN.heightM / grid.rows
  return Math.max(1, Math.round(metresPerCell / TARGET_M_PER_PX))
}

/**
 * Bilinear sample of the grid at fractional cell coordinates, in the grid's
 * own (flipped) frame. Returns NaN outside the water.
 *
 * NaN is the lake mask, so it cannot be averaged: mixing "no value" into a
 * number would bleed colour onto land and pull shoreline values toward zero.
 * Two rules keep the picture honest —
 *   1. the NEAREST cell decides whether this sample is water at all, so the
 *      lake's extent is exactly what it was when each cell was one pixel;
 *   2. only water neighbours contribute, with their weights renormalised, so
 *      a sample beside the shore is the average of the water around it.
 */
function sampleBilinear(
  values: Float64Array,
  rows: number,
  cols: number,
  flipVertical: boolean,
  flipHorizontal: boolean,
  y: number,
  x: number,
): number {
  const at = (r: number, c: number): number => {
    const sr = flipVertical ? rows - 1 - r : r
    const sc = flipHorizontal ? cols - 1 - c : c
    return values[sr * cols + sc]
  }
  const r0 = Math.floor(y)
  const c0 = Math.floor(x)
  const fy = y - r0
  const fx = x - c0
  const r1 = Math.min(rows - 1, Math.max(0, r0 + 1))
  const c1 = Math.min(cols - 1, Math.max(0, c0 + 1))
  const rr = Math.min(rows - 1, Math.max(0, r0))
  const cc = Math.min(cols - 1, Math.max(0, c0))

  // Rule 1: the nearest cell owns the mask — except within EDGE_REACH_CELLS
  // of water, where the nearest water cell's value carries on outward. That
  // sliver exists because the model's mask is the lake RASTERISED at 200 m:
  // between its stepped edge and the real coast lies water the model covers
  // but the raster dropped. Extending into it, then clipping to the coast,
  // reconstructs what rasterising lost. It never reaches past the coastline,
  // because the clip cuts everything outside the polygon.
  const nearest = at(fy < 0.5 ? rr : r1, fx < 0.5 ? cc : c1)
  if (Number.isNaN(nearest)) {
    const nearby = nearestWater(at, rows, cols, y, x)
    return nearby
  }

  // Rule 2: average the water neighbours, weights renormalised.
  let sum = 0
  let weight = 0
  const corners: [number, number, number][] = [
    [rr, cc, (1 - fy) * (1 - fx)],
    [rr, c1, (1 - fy) * fx],
    [r1, cc, fy * (1 - fx)],
    [r1, c1, fy * fx],
  ]
  for (const [r, c, w] of corners) {
    if (w === 0) continue
    const v = at(r, c)
    if (Number.isNaN(v)) continue
    sum += v * w
    weight += w
  }
  return weight > 0 ? sum / weight : nearest
}

/**
 * How far the field carries past the model's mask before the coastline clip
 * takes over, in grid cells. One cell (200 m on the model grid) is the width
 * of the rasterisation step itself — enough to close the gap, too little to
 * cross a bay or reach a shore the model does not cover.
 */
const EDGE_REACH_CELLS = 1

/** The closest water cell within EDGE_REACH_CELLS, or NaN if there is none. */
function nearestWater(
  at: (r: number, c: number) => number,
  rows: number,
  cols: number,
  y: number,
  x: number,
): number {
  let best = Number.NaN
  let bestDist = Number.POSITIVE_INFINITY
  const r0 = Math.round(y)
  const c0 = Math.round(x)
  for (let r = r0 - EDGE_REACH_CELLS; r <= r0 + EDGE_REACH_CELLS; r++) {
    if (r < 0 || r >= rows) continue
    for (let c = c0 - EDGE_REACH_CELLS; c <= c0 + EDGE_REACH_CELLS; c++) {
      if (c < 0 || c >= cols) continue
      const v = at(r, c)
      if (Number.isNaN(v)) continue
      const dist = (r - y) ** 2 + (c - x) ** 2
      if (dist < bestDist) {
        bestDist = dist
        best = v
      }
    }
  }
  return best
}

/**
 * RGBA pixels for the grid, row 0 = north (flips applied). Pure.
 *
 * `factor` samples each cell edge that many times (TERC-102); 1 samples cell
 * centres exactly, which is the original one-pixel-per-cell output.
 */
export function fieldPixels(
  grid: ScalarGrid,
  scale: ColorScale,
  factor = 1,
): Uint8ClampedArray {
  const { rows, cols, values, flipVertical, flipHorizontal } = grid
  const w = cols * factor
  const h = rows * factor
  const out = new Uint8ClampedArray(w * h * 4)
  for (let py = 0; py < h; py++) {
    // Pixel centre in cell-centre coordinates: at factor 1 this is exactly
    // the cell index, so the interpolation is a no-op.
    const y = (py + 0.5) / factor - 0.5
    for (let px = 0; px < w; px++) {
      const x = (px + 0.5) / factor - 0.5
      const v = sampleBilinear(values, rows, cols, flipVertical, flipHorizontal, y, x)
      const o = (py * w + px) * 4
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
 * Where a lat/lng lands on the north-aligned output canvas, in pixels.
 * Same flat-earth conversion the domain's own bounds use (lakeGrid.ts), at
 * a 35 km extent where it is worth centimetres.
 */
export function projectToCanvas(
  lat: number,
  lng: number,
  metresPerPx: number,
  outW: number,
  outH: number,
): [number, number] {
  const x = ((lng - LAKE_DOMAIN.centerLon) * M_PER_DEG_LON) / metresPerPx + outW / 2
  const y = -((lat - LAKE_DOMAIN.centerLat) * M_PER_DEG_LAT) / metresPerPx + outH / 2
  return [x, y]
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/**
 * Keep only what falls inside the lake (TERC-102).
 *
 * The model's mask is 200 m cells, so its edge stair-steps; OSM's polygon is
 * the actual coast. Islands are holes via the even-odd rule. Anything the
 * model paints outside Tahoe — Cascade Lake sits just beyond the south-west
 * shore — goes too, which is correct for a Lake Tahoe overlay.
 */
function clipToShoreline(ctx: Ctx2D, metresPerPx: number, outW: number, outH: number): void {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.beginPath()
  for (const ring of LAKE_SHORELINE_RINGS) {
    ring.forEach(([lng, lat], i) => {
      const [x, y] = projectToCanvas(lat, lng, metresPerPx, outW, outH)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
  }
  ctx.fillStyle = '#000'
  ctx.fill('evenodd')
  ctx.restore()
}

/**
 * The two-stage paint, on whichever canvas kind the thread has. Returns
 * the north-aligned output canvas, or null when 2D contexts are missing
 * (non-browser test environments).
 */
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas

function paintField(
  grid: ScalarGrid,
  scale: ColorScale,
  makeCanvas: (w: number, h: number) => AnyCanvas,
): AnyCanvas | null {
  const { rows, cols } = grid
  const factor = supersampleFactor(grid)

  // Stage 1 — the grid sampled at TARGET_M_PER_PX, in its own (rotated)
  // frame. After the flips, this canvas's "up" is always grid-north.
  const cellCanvas = makeCanvas(cols * factor, rows * factor)
  const cellCtx = cellCanvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!cellCtx) return null
  const img = cellCtx.createImageData(cols * factor, rows * factor)
  img.data.set(fieldPixels(grid, scale, factor))
  cellCtx.putImageData(img, 0, 0)

  // Stage 2 — rotate into a north-aligned canvas covering the domain's
  // bounding box. The sampled image is already at this resolution, so the
  // draw only rotates; it never enlarges.
  const metresPerCell = LAKE_DOMAIN.heightM / rows
  const metresPerPx = metresPerCell / factor
  const outW = Math.ceil((2 * LAKE_DOMAIN_AABB.halfWidthM) / metresPerPx)
  const outH = Math.ceil((2 * LAKE_DOMAIN_AABB.halfHeightM) / metresPerPx)

  const out = makeCanvas(outW, outH)
  const ctx = out.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.translate(outW / 2, outH / 2)
  // Canvas y points down, so a positive ctx.rotate is clockwise. rotationDeg
  // is CCW-positive in map terms, hence the negation: a negative rotationDeg
  // (grid-north tilting east) becomes a clockwise image rotation.
  ctx.rotate((-LAKE_DOMAIN.rotationDeg * Math.PI) / 180)
  ctx.drawImage(
    cellCanvas as CanvasImageSource,
    -LAKE_DOMAIN.widthM / metresPerPx / 2,
    -LAKE_DOMAIN.heightM / metresPerPx / 2,
    LAKE_DOMAIN.widthM / metresPerPx,
    LAKE_DOMAIN.heightM / metresPerPx,
  )
  // The model's mask is 200 m cells; the coast is not (TERC-102).
  clipToShoreline(ctx, metresPerPx, outW, outH)
  return out
}

/**
/**
 * WebP first, PNG if the engine will not encode it (TERC-102).
 *
 * At TARGET_M_PER_PX the overlay is ~865×1418 — a smooth, mostly-flat field
 * with an alpha mask, which is close to the worst case for PNG: measured
 * 1.04 MB per frame, and "Next 24 h" renders a frame per tick. WebP carries
 * the same picture and alpha at a fraction of that. Quality is high rather
 * than maximum: this is a colour field, not text or line art, so its
 * artefacts land far below a colour step the eye can find.
 *
 * Both paths verify what they got instead of assuming: a browser that
 * ignores the type silently hands back PNG, which is correct, just larger.
 */
const IMAGE_TYPE = 'image/webp'
const IMAGE_QUALITY = 0.9

/**
 * Synchronous render to a data URL on the main thread, or null where canvas
 * 2D is unavailable — callers treat null as "nothing to show". The fallback
 * path when there is no worker (TERC-47).
 */
export function renderFieldImage(grid: ScalarGrid, scale: ColorScale): string | null {
  if (typeof document === 'undefined') return null
  const out = paintField(grid, scale, (w, h) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  })
  if (!out) return null
  const canvas = out as HTMLCanvasElement
  const webp = canvas.toDataURL(IMAGE_TYPE, IMAGE_QUALITY)
  // toDataURL falls back to PNG silently; the prefix is the only proof.
  return webp.startsWith(`data:${IMAGE_TYPE}`) ? webp : canvas.toDataURL('image/png')
}

/**
 * Render to a Blob via OffscreenCanvas — usable from a worker, where there
 * is no document, and the encode (the heaviest step) leaves the main thread
 * entirely (TERC-47). Null when OffscreenCanvas is unavailable.
 */
export async function renderFieldBlob(grid: ScalarGrid, scale: ColorScale): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'undefined') return null
  const out = paintField(grid, scale, (w, h) => new OffscreenCanvas(w, h))
  if (!out) return null
  const canvas = out as OffscreenCanvas
  try {
    const blob = await canvas.convertToBlob({ type: IMAGE_TYPE, quality: IMAGE_QUALITY })
    if (blob.type === IMAGE_TYPE) return blob
  } catch {
    /* engine refused the type outright */
  }
  return canvas.convertToBlob({ type: 'image/png' })
}
