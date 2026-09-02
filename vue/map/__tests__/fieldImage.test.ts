import { describe, expect, it } from 'vitest'
import type { ScalarGrid } from '../../data/gridDecode'
import type { ColorScale } from '../../core/colorScale'
import { fieldPixels } from '../fieldImage'

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
    const px = fieldPixels(
      grid({ cols: 2, values: new Float64Array([NaN, 10]) }),
      SCALE,
    )
    expect(pixel(px, 0)[3]).toBe(0)
    expect(pixel(px, 1)[3]).toBe(255)
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
