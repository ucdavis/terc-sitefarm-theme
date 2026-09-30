import { describe, expect, it } from 'vitest'
import type { ScalarGrid } from '../../data/gridDecode'
import type { ColorScale } from '../../core/colorScale'
import { fieldPixels, projectToCanvas, supersampleFactor, TARGET_M_PER_PX } from '../fieldImage'
import { LAKE_DOMAIN, LAKE_DOMAIN_AABB, M_PER_DEG_LAT } from '../../config/lakeGrid'

const SCALE: ColorScale = {
  name: 'Test',
  unit: 'x',
  min: 0,
  max: 10,
  stops: ['#000000', '#ffffff'],
}

function grid(partial: Partial<ScalarGrid>): ScalarGrid {
  return {
    rows: 1,
    cols: 1,
    values: new Float64Array([0]),
    unit: 'x',
    flipVertical: false,
    flipHorizontal: false,
    ...partial,
  }
}

function pixel(px: Uint8ClampedArray, i: number): number[] {
  return [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]]
}

describe('fieldPixels', () => {
  it('maps values through the color scale, opaque', () => {
    const px = fieldPixels(grid({ values: new Float64Array([10]) }), SCALE)
    expect(pixel(px, 0)).toEqual([255, 255, 255, 255])
  })

  it('renders NaN cells fully transparent (the lake silhouette)', () => {
    // Two cells from the nearest water, i.e. past EDGE_REACH_CELLS — inside
    // that reach the field carries on (see the edge tests below).
    const px = fieldPixels(
      grid({ cols: 3, values: new Float64Array([NaN, NaN, 10]) }),
      SCALE,
    )
    expect(pixel(px, 0)[3]).toBe(0)
    expect(pixel(px, 2)[3]).toBe(255)
  })

  it('applies the vertical flip so row 0 of the output is north', () => {
    // Grid stored south-first: value 0 (black) in storage row 0 (south),
    // value 10 (white) in storage row 1 (north). With flipVertical the
    // OUTPUT's first row must be the white north row.
    const g = grid({
      rows: 2,
      cols: 1,
      values: new Float64Array([0, 10]),
      flipVertical: true,
    })
    const px = fieldPixels(g, SCALE)
    expect(pixel(px, 0)).toEqual([255, 255, 255, 255]) // north drawn first
    expect(pixel(px, 1)).toEqual([0, 0, 0, 255])
  })

  it('leaves unflipped grids in storage order (STWAVE, north-first)', () => {
    const g = grid({ rows: 2, cols: 1, values: new Float64Array([0, 10]) })
    const px = fieldPixels(g, SCALE)
    expect(pixel(px, 0)).toEqual([0, 0, 0, 255])
  })

  it('applies the horizontal flip when a grid declares it', () => {
    const g = grid({
      cols: 2,
      values: new Float64Array([0, 10]),
      flipHorizontal: true,
    })
    const px = fieldPixels(g, SCALE)
    expect(pixel(px, 0)).toEqual([255, 255, 255, 255])
    expect(pixel(px, 1)).toEqual([0, 0, 0, 255])
  })
})

/**
 * TERC-102. The overlay used to be painted one pixel per 200 m cell and then
 * enlarged ~6x by the browser. These cover the sampling that replaced it.
 */
describe('supersampleFactor', () => {
  it('lifts the 200 m model grid to the target resolution', () => {
    // 174 rows over 34,650 m = 199 m per cell.
    expect(supersampleFactor(grid({ rows: 174, cols: 102 }))).toBe(8)
  })

  it('asks much less of the already-fine wave grid', () => {
    // 695 rows = 50 m per cell, so it is nearly there already. A flat 8x
    // would have made an 18-megapixel PNG per frame.
    expect(supersampleFactor(grid({ rows: 695, cols: 406 }))).toBe(2)
  })

  it('never downsamples a grid finer than the target', () => {
    expect(supersampleFactor(grid({ rows: 5000, cols: 100 }))).toBe(1)
  })

  it('lands within a pixel of the target metres per pixel', () => {
    const rows = 174
    const metresPerPx = LAKE_DOMAIN.heightM / rows / supersampleFactor(grid({ rows, cols: 102 }))
    expect(Math.abs(metresPerPx - TARGET_M_PER_PX)).toBeLessThan(1)
  })
})

describe('fieldPixels sampling (TERC-102)', () => {
  it('interpolates between cell values instead of painting flat blocks', () => {
    // Two cells, 0 and 10, sampled 4x across: the samples between the centres
    // must climb, not jump.
    const px = fieldPixels(grid({ cols: 2, values: new Float64Array([0, 10]) }), SCALE, 4)
    const reds = Array.from({ length: 8 }, (_, i) => pixel(px, i)[0])
    expect(reds[0]).toBe(0) // left of the first centre: clamped
    expect(reds[7]).toBe(255) // right of the last centre: clamped
    const middle = reds.slice(1, 7)
    expect(middle).toEqual([...middle].sort((a, b) => a - b))
    expect(new Set(middle).size).toBeGreaterThan(1)
  })

  it('carries the field one cell past the mask, and no further', () => {
    // The model's mask is the lake rasterised at 200 m, so its edge steps
    // short of the real coast. The field reaches one cell beyond it (the
    // width of the step); the coastline clip then cuts back to the coast.
    // Beyond that reach, nothing is painted.
    const px = fieldPixels(grid({ cols: 4, values: new Float64Array([10, NaN, NaN, NaN]) }), SCALE)
    expect(pixel(px, 0)[3]).toBe(255) // water
    expect(pixel(px, 1)[3]).toBe(255) // one cell out: carried
    expect(pixel(px, 2)[3]).toBe(0) // two cells out: nothing
    expect(pixel(px, 3)[3]).toBe(0)
  })

  it('carries the water\'s own value outward, not a value mixed with land', () => {
    // The carried cell shows the water beside it (white), not a colour
    // dragged toward the scale's bottom by treating NaN as zero.
    const px = fieldPixels(grid({ cols: 2, values: new Float64Array([10, NaN]) }), SCALE)
    expect(pixel(px, 1)).toEqual([255, 255, 255, 255])
  })

  it('never averages land into the water inside the lake', () => {
    // A sample beside the shore takes the water neighbours only, with their
    // weights renormalised.
    const px = fieldPixels(grid({ cols: 2, values: new Float64Array([10, NaN]) }), SCALE, 2)
    expect(pixel(px, 0)).toEqual([255, 255, 255, 255])
  })

  it('at factor 1 is exactly the old per-cell output', () => {
    const g = grid({ rows: 2, cols: 2, values: new Float64Array([0, 10, NaN, 5]) })
    expect(Array.from(fieldPixels(g, SCALE, 1))).toEqual(Array.from(fieldPixels(g, SCALE)))
  })
})

describe('projectToCanvas (TERC-102)', () => {
  const metresPerPx = 25
  const outW = 864
  const outH = 1418

  it('puts the domain centre at the canvas centre', () => {
    const [x, y] = projectToCanvas(LAKE_DOMAIN.centerLat, LAKE_DOMAIN.centerLon, metresPerPx, outW, outH)
    expect(x).toBeCloseTo(outW / 2, 6)
    expect(y).toBeCloseTo(outH / 2, 6)
  })

  it('puts north up: a higher latitude is a smaller y', () => {
    const [, yNorth] = projectToCanvas(LAKE_DOMAIN.centerLat + 0.1, LAKE_DOMAIN.centerLon, metresPerPx, outW, outH)
    expect(yNorth).toBeLessThan(outH / 2)
  })

  it('scales by metres per pixel', () => {
    const km = 1000 / M_PER_DEG_LAT // one kilometre of latitude, in degrees
    const [, y] = projectToCanvas(LAKE_DOMAIN.centerLat + km, LAKE_DOMAIN.centerLon, metresPerPx, outW, outH)
    expect(outH / 2 - y).toBeCloseTo(1000 / metresPerPx, 6)
  })

  it('maps the domain bounding box to the canvas edges', () => {
    const north = LAKE_DOMAIN.centerLat + LAKE_DOMAIN_AABB.halfHeightM / M_PER_DEG_LAT
    const [, y] = projectToCanvas(north, LAKE_DOMAIN.centerLon, metresPerPx, outW, outH)
    expect(y).toBeCloseTo(outH / 2 - LAKE_DOMAIN_AABB.halfHeightM / metresPerPx, 6)
  })
})
