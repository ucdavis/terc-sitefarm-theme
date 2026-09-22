# Manual site setup — no PHP in the theme

SiteFarm **rejects a custom theme that contains PHP files** other than its own
`terc.theme` (TERC-90): installing this theme on prod failed on two Drush
scripts that used to live in `scripts/`. They are archived outside the repo, at
`~/Projects/TERC/drupal-php-scripts/`, and CI now fails on any tracked PHP file
other than `terc.theme`.

What those scripts did is done here instead: once per site, in the Drupal
admin UI.

---

## 1. Brand color on condition bands (TERC-60)

Lets editors pick each interpretation band's chip color from the UC Davis
palette. **Optional:** without it the block uses each tone's default color and
logs one console warning. Needed **once per site**.

**Check first.** *Structure → Taxonomy → Condition interpretation bands →
Manage fields.* If **Brand color** (`field_band_brand_color`) is listed, skip
this section.

> Status, Sep 2026: **absent on prod** (tahoe.ucdavis.edu) — do this there.
> The vocabulary itself, its Tone field, and Branding's own color field are
> all present.

### Add the field

1. *Structure → Taxonomy → **Condition interpretation bands** → **Manage
   fields** → **Create a new field**.*
2. Field type: **Reference**, then **Taxonomy term**.
3. Label: **`Brand color`**.
   **Edit the machine name to `band_brand_color`** so it is saved as
   `field_band_brand_color`. Drupal suggests `field_brand_color` from the
   label, and the block will not find that name.
4. **Allowed number of values:** Limited, **1**.
5. **Help text:**
   `Optional. The UC Davis brand color for this band’s chip, chosen from the site’s brand vocabulary. Leave unset to use the tone’s default color.`
6. **Required:** unchecked.
7. **Reference type:**
   - Vocabularies: **Branding** only.
   - Sort by **Name**, **Ascending**.
   - *Create referenced entities if they don't already exist*: **unchecked**.
8. **Save.**

### Place it

9. **Manage form display:** set **Brand color**'s widget to **Select list**
   and drag it directly **below Tone**, so the two color choices sit together.
   Save.
10. **Manage display:** drag **Brand color** into **Disabled**. The block
    reads it; it should not print on term pages. Save.

### Verify

- Edit any band: a **Brand color** select appears under Tone, listing the
  Branding terms.
- On `/real-time-conditions`, the browser console no longer logs
  `[terc] this site has no field_band_brand_color on condition_bands yet`.
- Or directly:
  `/jsonapi/taxonomy_term/condition_bands?include=field_band_brand_color`
  now returns 200 instead of 400.

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
