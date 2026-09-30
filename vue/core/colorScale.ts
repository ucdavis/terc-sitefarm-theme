/**
 * Color scales shared by the field renderer AND the legends (TERC-23) — a
 * single definition drives both, so they can never disagree.
 */
import { MS_PER_MPH } from './units'

/**
 * A second unit shown beside the primary one, in parentheses (TERC-100).
 *
 * A plain factor rather than a conversion function, because a scale is
 * posted to the render worker and must stay structured-cloneable.
 */
export interface ScaleSecondaryUnit {
  /** Label, e.g. 'm/s'. */
  unit: string
  /** How many of this unit make one of the primary. */
  perPrimary: number
  /** Decimals this unit needs across the scale's range. */
  digits: number
}

export interface ColorScale {
  name: string
  unit: string
  min: number
  max: number
  /** Hex stops, evenly spaced from min to max. */
  stops: string[]
  /** Set to show every number in a second unit too (TERC-100). */
  secondary?: ScaleSecondaryUnit
}

/**
 * A value in the scale's units, with the second unit in parentheses when the
 * scale carries one: "0.34 mph (0.15 m/s)".
 *
 * Every place a visitor reads a number off one of these maps goes through
 * here — the colorbar ticks and the map's spoken text alternative — so the
 * legend and the readout cannot end up in different units (TERC-100).
 */
export function formatScaleValue(scale: ColorScale, value: number, digits: number): string {
  const primary = `${value.toFixed(digits)} ${scale.unit}`
  if (!scale.secondary) return primary
  const { unit, perPrimary, digits: secondDigits } = scale.secondary
  return `${primary} (${(value * perPrimary).toFixed(secondDigits)} ${unit})`
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

/**
 * The full-spectrum gradation — navy, blue, cyan, green, yellow, orange, red
 * — shared by every forecast field that should read "low → high" the same
 * way (TERC-81). One array, not copies: temperature and wave height used to
 * look like two different kinds of map, and copied stops would drift apart.
 * Currents keeps its own scale.
 */
export const FULL_SPECTRUM_STOPS: readonly string[] = [
  '#20214e', '#243b8f', '#2a5cbf', '#3180d4', '#3fa2dc', '#59bfdc',
  '#7dd6d2', '#a8e4bc', '#cfe99f', '#e9e284', '#f7cd62', '#fbab45',
  '#f5822f', '#e6571f', '#c93214', '#a3160e',
]

/** Surface temperature, °F — full spectrum, cool → warm (TERC-23). */
export const TEMPERATURE_SCALE: ColorScale = {
  name: 'Surface temperature',
  unit: '°F',
  min: 40,
  max: 80,
  stops: [...FULL_SPECTRUM_STOPS],
}

/**
 * Current speed, mph with m/s in parentheses (TERC-100, at the science
 * team's request; ft/min before that).
 *
 * Lake currents are slow, so the unit has to be read together with its
 * precision. Measured over the whole published model window (13 flow frames
 * spanning 2026-09-16 to 2026-10-03, 161,590 water cells): median
 * 0.06 mph, 90th percentile 0.19 mph, 99th 0.34 mph, highest cell in any
 * frame 0.82 mph. Two decimals therefore resolve the lake, and m/s — the
 * unit the model itself publishes — rides along for anyone checking the
 * numbers against the model.
 *
 * The top is 1.1 mph rather than the old 100 ft/min (1.14 mph): it is above
 * every value measured above, and with 12 stops it puts a tick on each
 * clean 0.1 mph — a colorbar whose labels are exact instead of rounded.
 */
export const CURRENT_SCALE: ColorScale = {
  name: 'Current speed',
  unit: 'mph',
  min: 0,
  max: 1.1,
  secondary: { unit: 'm/s', perPrimary: MS_PER_MPH, digits: 2 },
  stops: [
    '#0b1d40', '#173a6d', '#1f5d8f', '#2b83a4', '#41a8ab', '#69c8a4',
    '#a4df9a', '#e0ef9c', '#fddc7a', '#f9a75b', '#ec6b45', '#d13a3a',
  ],
}

/**
 * Wave height, ft (TERC-24) — full spectrum since TERC-81, matching
 * temperature, so both forecast maps read blue = low, red = high.
 *
 * It was a single-hue light-blue → navy ramp, carried over unchanged from
 * the prototype; nobody had chosen it over the full spectrum. The prototype's
 * one real concern was calm days, which put the whole lake in the bottom few
 * percent of the scale: its low end had to stay a clear blue, not near-white,
 * to read against the pale basemap. The full spectrum's low end is deep navy,
 * which reads more strongly still — a calm lake is now unmistakably "low",
 * not faint.
 */
export const WAVE_SCALE: ColorScale = {
  name: 'Wave height',
  unit: 'ft',
  min: 0,
  max: 5,
  stops: [...FULL_SPECTRUM_STOPS],
}
