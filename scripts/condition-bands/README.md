# condition_bands — one-off field scripts

Drush scripts that shape the `condition_bands` vocabulary. Core Field UI
config only (no modules); each is idempotent, so re-running is safe.

## add-brand-color-field.php (TERC-60)

Adds `field_band_brand_color`: an optional entity reference from a
condition band to an `sf_branding` term (SiteFarm's own UC Davis brand
vocabulary), edited with a plain select. Editors pick each band's chip
color in the same taxonomy screen where they write the band; unset keeps
the tone default (good / fair / caution / info).

```bash
# local
ddev drush scr sites/default/themes/terc/scripts/condition-bands/add-brand-color-field.php
# tercdev (ACSF alias; copy the file where remote drush can read it first)
drush @ucdsitefarm.01dev --uri=https://tercdev.sf.ucdavis.edu scr add-brand-color-field.php
```

The block reads the referenced term's `field_sf_brand_color` **identifier**
over JSON:API (`include=field_band_brand_color`) and resolves it through
`vue/config/brandPalette.ts`, whose per-identifier chip treatments are
contrast-audited by test (≥ 4.5:1). A site that has not run this script
yet still works: the include is rejected with 400, the block warns once
and refetches the bands without it. The registry seeder needs no change.
