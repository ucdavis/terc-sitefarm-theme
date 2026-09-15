/**
 * How much of the row the map column takes on wide screens (TERC-74).
 *
 * The map is the navigation surface, and how much room it deserves depends
 * on the page: a third frames the lake beside a full-width reading column,
 * two-thirds turns the block into a map-first view. Editors pick this per
 * block, so the same components serve both without a code change.
 *
 * Below the 900px breakpoint the row collapses to a single column and this
 * has no effect — the map is always full width on phones.
 *
 * The values are emitted as custom properties rather than classes because
 * they have to reach `.field-row` inside the Forecasted views, which are
 * three components below the shell. Custom properties inherit, so the shell
 * sets them once on its root and every map row downstream reads them.
 */
export type MapWidth = 'third' | 'half' | 'two-thirds'

export const DEFAULT_MAP_WIDTH: MapWidth = 'third'

/** Grid fractions: [map column, reading column]. */
const FRACTIONS: Record<MapWidth, [number, number]> = {
  third: [1, 2],
  half: [1, 1],
  'two-thirds': [2, 1],
}

export function normalizeMapWidth(value: unknown): MapWidth {
  return value === 'third' || value === 'half' || value === 'two-thirds' ? value : DEFAULT_MAP_WIDTH
}

/**
 * Custom properties for a shell root. The map column also carries a minimum
 * width (set in each row's own CSS, since the Forecasted row has to leave
 * room for the colorbar too), so no setting can squeeze the lake below the
 * width it needs to stay legible. Above that floor the columns split the row
 * by these fractions.
 */
export function mapWidthStyle(value: unknown): Record<string, string> {
  const [map, side] = FRACTIONS[normalizeMapWidth(value)]
  return { '--map-fr': `${map}fr`, '--side-fr': `${side}fr` }
}
