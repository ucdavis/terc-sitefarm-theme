/**
 * WCAG 2.x color arithmetic — sRGB relative luminance and contrast ratio
 * (https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio) plus simple mixing.
 * Pure functions on hex strings; the brand-palette audit and its test both
 * build on these, so the numbers the test checks are the ones shipped.
 */

export type Rgb = readonly [number, number, number]

/** `#rgb` or `#rrggbb` (case-insensitive) -> 0–255 channels. */
export function hexToRgb(hex: string): Rgb {
  const h = hex.trim().replace(/^#/, '')
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex color: ${hex}`)
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: Rgb): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** WCAG relative luminance, 0 (black) – 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colors, 1 – 21. Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Linear mix in sRGB space: `amount` 0 -> all `a`, 1 -> all `b`. */
export function mix(a: string, b: string, amount: number): string {
  const t = Math.max(0, Math.min(1, amount))
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  return rgbToHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t])
}

/** WCAG AA minimum for normal text. */
export const AA_TEXT = 4.5
