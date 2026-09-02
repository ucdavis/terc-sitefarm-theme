/**
 * Color scales shared by the field renderer AND the legends (TERC-23) — a
 * single definition drives both, so they can never disagree.
 */

export interface ColorScale {
  name: string
  unit: string
  min: number
  max: number
  /** Hex stops, evenly spaced from min to max. */
  stops: string[]
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/** Map a value to [r,g,b] by linear interpolation between stops. */
export function scaleColor(scale: ColorScale, value: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, (value - scale.min) / (scale.max - scale.min)))
  const pos = t * (scale.stops.length - 1)
  const i = Math.min(scale.stops.length - 2, Math.floor(pos))
  const f = pos - i
  const a = hexToRgb(scale.stops[i])
  const b = hexToRgb(scale.stops[i + 1])
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ]
}

/** CSS gradient string for legends, built from the same stops. */
export function scaleGradientCss(scale: ColorScale, direction = 'to top'): string {
  return `linear-gradient(${direction}, ${scale.stops.join(', ')})`
}

/** Surface temperature, °F — 16 stops, cool → warm (TERC-23). */
export const TEMPERATURE_SCALE: ColorScale = {
  name: 'Surface temperature',
  unit: '°F',
  min: 40,
  max: 80,
  stops: [
    '#20214e', '#243b8f', '#2a5cbf', '#3180d4', '#3fa2dc', '#59bfdc',
    '#7dd6d2', '#a8e4bc', '#cfe99f', '#e9e284', '#f7cd62', '#fbab45',
    '#f5822f', '#e6571f', '#c93214', '#a3160e',
  ],
}

/** Current speed, ft/min (TERC-25). */
export const CURRENT_SCALE: ColorScale = {
  name: 'Current speed',
  unit: 'ft/min',
  min: 0,
  max: 100,
  stops: [
    '#0b1d40', '#173a6d', '#1f5d8f', '#2b83a4', '#41a8ab', '#69c8a4',
    '#a4df9a', '#e0ef9c', '#fddc7a', '#f9a75b', '#ec6b45', '#d13a3a',
  ],
}

/** Wave height, ft (TERC-24). The low end is deliberately a CLEAR light
 *  blue, not near-white: calm days put the whole lake in the bottom 2% of
 *  this scale, and it still has to read against the pale basemap. */
export const WAVE_SCALE: ColorScale = {
  name: 'Wave height',
  unit: 'ft',
  min: 0,
  max: 5,
  stops: [
    '#c4e0f2', '#98c8e8', '#6fafdd', '#4b93d0', '#3477c1', '#2a5cae',
    '#254295', '#212c77', '#1c1d58',
  ],
}
