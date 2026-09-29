# Manual site setup — no PHP in the theme

SiteFarm **rejects a custom theme that contains PHP files** other than its own
`terc.theme` (TERC-90): installing this theme on prod failed on two Drush
scripts that used to live in `scripts/`. They are archived outside the repo, at
`~/Projects/TERC/drupal-php-scripts/`, and CI now fails on any tracked PHP file
other than `terc.theme`.

What those scripts did is done here instead: once per site, in the Drupal
admin UI.

---

## 1. Brand color on condition bands (TERC-60, TERC-77)

Lets editors pick each interpretation band's chip color from the UC Davis
palette, with SiteFarm's color-swatch picker. **Optional:** without it every
band uses its tone's default color. Needed **once per site**.

This re-uses SiteFarm's OWN field, `field_sf_brand_color` — the one on the
Branding terms — rather than a new field of our own. That is what gives the
swatch picker: `sitefarm_core` wraps any select whose field name contains
`field_sf_brand` in the `<sf-brand-color-select>` web component. It also
means the palette comes from SiteFarm's own allowed values, so every color
is offered exactly once, whatever state a site's Branding vocabulary is in.

**Check first.** *Structure → Taxonomy → Condition interpretation bands →
Manage fields.* If **Brand Color** (`field_sf_brand_color`) is listed, skip
this section. If a field named `field_band_brand_color` is listed — an
earlier attempt that referenced a Branding term — delete it; nothing reads
it any more.

### Add the field

1. *Structure → Taxonomy → **Condition interpretation bands** → **Manage
   fields***.
2. **Re-use an existing field** (the button beside *Create a new field*).
3. Pick **`field_sf_brand_color`** (Brand Color) from the list. It is there
   because the Branding vocabulary already uses it; a field's storage is
   shared across every bundle of the same entity type.
4. Label: **`Brand Color`**.
5. Help text:
   `Optional. The UC Davis brand color for this band’s chip. Leave empty to use the tone’s default color.`
6. **Required:** unchecked. **Save.**

### Place it

7. **Manage form display:** the widget is **Select list**; drag it directly
   **below Tone**, so the two color choices sit together. Save.
8. **Manage display:** drag **Brand Color** into **Disabled**. The block
   reads it; it should not print on term pages. Save.

### Verify

- Edit any band: **Brand Color** appears under Tone as a dropdown of color
  swatches (not plain text). Pick one and save.
- On `/real-time-conditions`, that band's chip takes the brand color. Bands
  left empty keep their tone color.
- Or directly: `/jsonapi/taxonomy_term/condition_bands` now includes
  `field_sf_brand_color` on each term.

Only identifiers from the audited palette in `vue/config/brandPalette.ts`
produce a chip; anything else logs a warning naming the band and falls back
to the tone. Content names a color, it never defines one, so no hex from
the site can reach a chip.

---

## 2. Lake Stations and Lake Locations content

**Use the sync, not the admin UI, whenever you can.** It runs from your own
machine over JSON:API — no PHP, nothing to install on the site — and has
been confirmed working against prod:

```bash
cd scripts/registry-sync
node sync.mjs --dry-run --skip-bands   # review
node sync.mjs --skip-bands             # apply
```

`--skip-bands` leaves the condition bands alone: re-running the bands sync
overwrites anything editors have reworded. See `scripts/registry-sync/README.md`
for prerequisites and flags.

### By hand, if the sync cannot be used

`scripts/registry-sync/registry.data.json` is the source of truth; copy the
values from it. **Create every Lake Station before any Lake Location**, because
a location's *Stations* field references stations by name.

**Lake Station** (*Content → Add content → Lake Station*):

| Admin field | Machine name | From `registry.data.json` → `stations[]` |
|---|---|---|
| Name | `title` | `name` |
| Station Type | `field_station_type` | `family` — `nearshore_station`, `met_station`, `nasa_buoy` or `tc_homewood` |
| Station ID | `field_station_id` | `id` — **leave empty** for Homewood TC (`tc_homewood`, whose `id` is null) |
| Station geo data | `field_location_geo_data` | `lat`, `lng` — **all five decimals**; a two-decimal value is ±430 m here and can land on shore |
| Station Status | `field_station_status` | optional; `active` or `maintenance`. The sync sets it from the report API; by hand, use what TERC reports |

**Lake Locations** (*Content → Add content → Lake Locations*):

| Admin field | Machine name | From `registry.data.json` → `destinations[]` |
|---|---|---|
| Location Name | `title` | `name` |
| Location ID | `field_location_id` | `slug` — must match exactly; the page's `?cc-dest=` links use it |
| Location geo data | `field_location_geo_data` | `lat`, `lng` |
| Zoom | `field_location_zoom` | `zoom` — a **ceiling** on the map's framing, not a view zoom (TERC-89) |
| Stations | `field_stations` | `stations` — each `family:id` entry is the Lake Station with that type and ID |

Both content types publish by default.
