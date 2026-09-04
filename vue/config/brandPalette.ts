/**
 * Band chip colors (TERC-60): the ONE place chip colors come from.
 *
 * Two sources, in priority order:
 *  1. A UC Davis brand color the web team assigned to the band in Drupal
 *     (condition_bands → sf_branding reference). Content supplies only the
 *     brand IDENTIFIER (`field_sf_brand_color`, e.g. "tahoe"); the hex
 *     lives here, mirrored from SiteFarm's `$category-brands`
 *     (sitefarm_one/sass/1_pattern_lab/_variables.scss), so a chip can
 *     never carry an off-palette color.
 *  2. The band's tone (good / fair / caution / info) — the default when no
 *     brand is set, and the fallback for an unknown identifier.
 *
 * Brand colors are identity colors, not text colors, so every identifier
 * gets a computed chip treatment: a light tint of the brand behind a shade
 * of the same brand dark enough for WCAG AA (≥ 4.5:1). The audit is by
 * computation and enforced by brandPalette.test.ts — an identifier that
 * could not reach AA would be excluded (null) rather than shipped.
 */
import { AA_TEXT, contrastRatio, mix } from '../core/contrast'
import type { QualityAssessment, QualityTone } from './qualitative'

export interface ChipColors {
  /** Chip background. */
  bg: string
  /** Chip text; ≥ 4.5:1 against `bg`. */
  fg: string
}

/**
 * SiteFarm brand identifiers -> hex. Keys are the `field_sf_brand_color`
 * allowed values plus the theme-only "primary"/"secondary" pair. Legacy
 * class names (sky-blue, cork-oak, …) are not identifiers and are omitted.
 */
export const BRAND_PALETTE: Readonly<Record<string, string>> = {
  'primary': '#022851', // Aggie Blue
  'secondary': '#ffbf00', // Aggie Gold
  'admin-blue': '#13639e', // Wonder Blue (brand primary 80)
  'rec-pool': '#6fcfeb',
  'tahoe': '#00b2e3',
  'gunrock': '#0047ba',
  'bodega': '#003a5d',
  'rain': '#03f9e6',
  'arboretum': '#00c4b3',
  'putah-creek': '#008eaa',
  'delta': '#00524c',
  'farmers-market': '#aada91',
  'sage': '#6cca98',
  'quad': '#3dae2b',
  'redwood': '#266041',
  'golden-state': '#ffff3b',
  'sunflower': '#ffdc00',
  'poppy': '#f18a00',
  'california': '#8a532f',
  'rose': '#ff8189',
  'strawberry': '#f93549',
  'double-decker': '#c10230',
  'merlot': '#79242f',
  'thiebaud-icing': '#f095cd',
  'redbud': '#c6007e',
  'pinot': '#76236c',
  'cabernet': '#481268',
  'centennial-walk-gray': '#b2b2b2',
}

/** Tone defaults — formerly copy-pasted into each component's CSS. */
export const TONE_COLORS: Readonly<Record<QualityTone, ChipColors>> = {
  good: { bg: '#e3f0e9', fg: '#1c6b45' },
  fair: { bg: '#fdf3e0', fg: '#8f6614' },
  caution: { bg: '#fbe9e5', fg: '#a03a22' },
  info: { bg: '#e4ecf7', fg: '#24558f' },
}

const WHITE = '#ffffff'
const BLACK = '#000000'
/** How far toward white the chip background sits (0 = the brand itself). */
const TINT = 0.86
/** Darkening per step while searching for an AA text shade. */
const SHADE_STEP = 0.08
const MAX_SHADE_STEPS = 24

/**
 * Compute the audited chip treatment for a brand hex, or null when no shade
 * of it reaches AA on its tint (cannot happen for a light tint, but the
 * palette is data and the guard is what the test enforces).
 */
export function chipTreatment(hex: string): ChipColors | null {
  const bg = mix(hex, WHITE, TINT)
  let fg = hex
  for (let i = 0; i <= MAX_SHADE_STEPS; i++) {
    if (contrastRatio(fg, bg) >= AA_TEXT) return { bg, fg }
    fg = mix(fg, BLACK, SHADE_STEP)
  }
  return null
}

const treatments = new Map<string, ChipColors | null>()

/**
 * Chip colors for a brand identifier; null for an unknown identifier or one
 * whose treatment failed the audit. Memoized per identifier.
 */
export function brandChipColors(identifier: string): ChipColors | null {
  if (!treatments.has(identifier)) {
    const hex = BRAND_PALETTE[identifier]
    treatments.set(identifier, hex ? chipTreatment(hex) : null)
  }
  return treatments.get(identifier) ?? null
}

/**
 * Whether content may use this identifier: known AND audited. The bands
 * adapter consults this so an unusable choice degrades to the tone default
 * (with a warning naming the term) instead of reaching the UI.
 */
export function isUsableBrand(identifier: string): boolean {
  return brandChipColors(identifier) !== null
}

/** The colors a band chip should render with. */
export function bandChipColors(a: Pick<QualityAssessment, 'tone' | 'brand'>): ChipColors {
  return (a.brand ? brandChipColors(a.brand) : null) ?? TONE_COLORS[a.tone]
}

/**
 * Inline style for a chip: the colors travel as custom properties so each
 * component's CSS reads `var(--band-bg)` / `var(--band-fg)` and owns no
 * hexes of its own.
 */
export function bandChipStyle(a: Pick<QualityAssessment, 'tone' | 'brand'>): Record<string, string> {
  const c = bandChipColors(a)
  return { '--band-bg': c.bg, '--band-fg': c.fg }
}
