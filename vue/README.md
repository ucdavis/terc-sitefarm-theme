# TERC Vue block bundles

Vue 3 + TypeScript workspace for the progressively decoupled blocks that make
up the Lake Tahoe Conditions features (TERC-14). Ported from and modeled on
the prototype at `ucdavis/terc-vue-prototype`.

## How it fits together

```
vue/
  entries/     One .ts entry per BLOCK GROUP. Each is registered as its own
               Drupal library in ../terc.libraries.yml (vite: true).
               current-conditions.ts   -> terc/vue-current-conditions
               (future) modeled-conditions.ts, weather-alerts.ts
  components/  Vue SFCs (the blocks and their children).
  core/        Shared plumbing ported from the prototype: cache.ts
               (DataCache: TTL + LRU + in-flight join), requestState.ts
               (idle/loading/success/empty/error), units.ts.
  config/      Endpoint/station/destination config (populated in TERC-16).
  lib/mount.ts Data-attribute mounting for Drupal blocks (see below).
  dev.html     Standalone dev harness for `npm start`, never built/shipped.
```

The theme's normal `npm run build` / `npm start` (ucd-theme-tasks → Vite)
builds these entries alongside the theme's sass/js — see the `vueEntries`
section merged into ../vite.config.mjs. **Do not** add a separate build here.

### Why entries-per-group instead of one SPA

All entries build together, so Rollup factors modules shared between them
(core/cache, data modules) into common chunks. The browser instantiates an ES
module once per page regardless of how many entries import it — every block
on a page therefore shares ONE DataCache instance, preserving the prototype's
request de-duplication and zero-refetch behavior without a single mega-app.
Modeled-only weight (npy parsing, grid rendering) stays out of the real-time
chunk graph.

## Adding a block component

1. Create the SFC in `components/`.
2. Register it in the owning entry:
   `registerBlocks({ 'my-block': MyBlock })`
3. Drupal-side markup renders a placeholder (via a PDB component or any
   block template — TERC-15):
   `<div data-terc-block="my-block" data-terc-props='{"foo":"bar"}'></div>`
   and attaches the entry's library (e.g. `terc/vue-current-conditions`).

`data-terc-props` JSON becomes the component's props. The same block can be
placed any number of times; each placeholder gets its own app instance.
Mounting is wired through `Drupal.behaviors`, so blocks inserted by AJAX
mount too.

## Dev workflows

```bash
# Watch + HMR dev server (see settings.local.php 'vite' block to make
# Drupal itself pull from the dev server):
ddev exec "cd docroot/sites/default/themes/terc && npm start"

# Standalone harness (no Drupal) at <dev server URL>/vue/dev.html

# Production build (also runs on npm install via postinstall):
ddev exec "cd docroot/sites/default/themes/terc && npm run build"

# Type-check:
ddev exec "cd docroot/sites/default/themes/terc && npm run typecheck"
```

Production asset resolution is handled by the drupal/vite module (enabled on
this site): libraries flagged `vite: true` in terc.libraries.yml are
rewritten through `dist/.vite/manifest.json`, including entry CSS. After
adding a new entry/library, run `drush cr` (library definitions are cached).

## Exposing a component as a Drupal block (TERC-15)

Block exposure uses the contrib **pdb** (Progressively Decoupled Blocks) +
**pdb_vue** modules (enable both: `drush en pdb pdb_vue`). Each block gets a
PDB component directory in the theme:

```
components/<file_name>/
  <file_name>.info.yml   type: pdb, presentation: vue — makes it a placeable
                         block ("vue_component:<file_name>" derivative)
  template.html          <div data-terc-block="<machine-name>"></div>
```

Three integration rules, all learned the careful way:

1. **Never declare assets in the component info.yml.** A `libraries:` key
   there makes pdb_vue force-attach its CDN global Vue next to our bundled
   one, and `add_js:` paths bypass the drupal/vite manifest. Instead, map
   the block's derivative id to its entry library in
   `terc_preprocess_block()` (terc.theme).
2. **Derivative ids use the component FILE basename** (`hello_lake`), while
   markup classes use the yaml `machine_name` (`hello-lake`). Keep the
   data-terc-block value equal to machine_name.
3. **Editor-configurable props**: declare a `configuration:` map in the
   info.yml (Form API elements). Saved values arrive as
   `drupalSettings.pdb.configuration[<uuid>]`, the uuid matching the PDB
   wrapper div id; `lib/mount.ts` merges them over `data-terc-props`
   (empty strings are dropped so component defaults apply).

After adding a component: `drush cr` (block plugins and libraries are
cached). Place the block via the block UI or layout builder — it appears
under the "TERC Lake Conditions" category.

## Station data module (TERC-16)

`data/stationData.ts` is the one normalized interface for the TERC report
API (`config/endpoints.ts` REPORT_BASE): near-shore stations
(`fetchNearshoreRange`), the USCG met station (`fetchMetStation`), NASA
buoys (`fetchNasaBuoy`), and tc-homewood. Components never touch raw API
fields — records arrive unit-converted (°F/ft/mph), sentinel-cleaned, and
sorted ascending regardless of endpoint order.

**⚠ Timestamp correction vs the prototype:** API TmStamps are **UTC**, not
Pacific (verified 2026-08-24 against the clock — see `core/time.ts`). The
prototype displayed every reading 7–8 h in the future. Date params
(rptdate/rptend) are UTC calendar days too. Use `LAKE_TZ` from
`core/time.ts` when *formatting* times for display so every viewer sees
lake time.

## Cache diagnostics overlay (TERC-36)

`components/CacheDiagnostics.vue` renders the live hit/miss/join/prefetch
panel from the prototype. It is enabled per block instance via the "Show
cache diagnostics" checkbox on the PDB block settings form (`debug` prop);
only one overlay renders no matter how many blocks enable it.

## Site-owned registry (TERC-46)

`vue/data/locations.ts` fetches the **Lake Destinations** (`lake_locations`)
and **Lake Station** (`station`) content types over the site's own JSON:API
(`/jsonapi/node/lake_locations?include=field_stations`, anonymous read) and
adapts them into the `DestinationDef` / `RegistryStation` shapes. The shell
calls `loadRegistry()` on mount; until it resolves — or if it fails — the
components serve the static code registry in `vue/config/` (the empirically
verified fallback). Station ids are scoped per `field_station_type`
(`nearshore_station` / `met_station` / `nasa_buoy`), mirroring the report
API's endpoint families. Editors adding a station/destination node changes
the map with no deploy; the code registry only changes when the fallback
needs updating.
