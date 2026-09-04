# TERC Vue block bundles

Vue 3 + TypeScript workspace for the progressively decoupled blocks that make
up the Lake Tahoe Conditions features. Ported from the prototype at
`ucdavis/terc-vue-prototype`, hardened for production.

**Where it runs:** the Current Conditions block lives on the
`/real-time-conditions` page (an ordinary SiteFarm page with the block placed
on it). Locally: `http://localhost:8080/real-time-conditions`. Phase 2 will be
**Forecasted Conditions** at `/forecasted-conditions` (the prototype called
this "modeled conditions" — use forecast-first wording in anything
user-facing).

## How it fits together

```
vue/
  entries/       One .ts entry per BLOCK GROUP. Each is registered as its own
                 Drupal library in ../terc.libraries.yml (vite: true).
                 current-conditions.ts   -> terc/vue-current-conditions
                 forecasted-conditions.ts -> terc/vue-forecasted-conditions
                 weather-alerts.ts       -> terc/vue-weather-alerts
  components/    Vue SFCs. Top-level blocks (CurrentConditionsShell) and
                 their children (LakeMap, PlanYourDayView, WaterQualityView,
                 StationCard, TimeSeriesChart, SourceBadge, LoadingState,
                 CacheDiagnostics) + __tests__/.
  composables/   Shared reactive state and data loading:
                 useConditionsState  page-wide selection singleton (view,
                                     destination, focused station), mirrored
                                     into cc-* URL params (deep links, back
                                     button); owns the registry ref
                 useLakeOverview     every station's latest reading for the
                                     map badges
                 useDestinationData  per-destination station/buoy/homewood
                                     series for the card views
                 useFocusedStation   the single map-focused station's series
  data/          Fetch + adapt layers:
                 stationData.ts      THE interface to the TERC report API —
                                     unit-converted, sentinel-cleaned, sorted
                 locations.ts        site-owned registry over JSON:API
                                     (Lake Destinations + Stations), static
                                     config fallback
                 conditionBands.ts   editor-owned interpretation bands over
                                     JSON:API (condition_bands taxonomy),
                                     code fallback per metric
  config/        Static config & fallbacks: endpoints, stations,
                 destinations, lakeView (map framing), qualitative.ts
                 (fallback bands + assessMetric + cold-water-shock note)
  core/          Plumbing: cache.ts (DataCache: TTL + LRU + in-flight join),
                 requestState.ts, units.ts (parseReading, plausibility),
                 time.ts (UTC parsing, LAKE time display formatting)
  map/           engine.ts (map interface) + leafletEngine.ts — the ONLY
                 file that imports Leaflet. TimeSeriesChart.vue is likewise
                 the only file importing Chart.js. Swappability is tested by
                 driving components with fake engines.
  lib/mount.ts   Data-attribute mounting for Drupal blocks (see below).
  dev.html       Standalone dev harness for `npm start`, never built/shipped.
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
Forecast-only weight (npy parsing, grid rendering) stays out of the real-time
chunk graph.

## From prototype component to decoupled block — step by step

This is the full path for taking a Vue component — from the prototype, from
another project, or written fresh — and shipping it as a block an editor can
place. Follow it in order; each step is small.

### Step 1 — Bring the component in and adapt its imports

Copy the `.vue` file into `vue/components/`. Then rewire what it consumes,
because this theme centralizes the things a prototype does ad hoc:

| The component probably has…              | Replace with…                                        |
|------------------------------------------|------------------------------------------------------|
| its own `fetch()` calls to the TERC API  | functions from `data/stationData.ts` (adds caching, unit conversion, sentinel cleaning) |
| hard-coded station/destination lists     | the registry via `useConditionsState().registry`     |
| hard-coded interpretation text/colors    | `assessMetric()` from `config/qualitative.ts` (editor-owned bands flow in automatically) |
| `toLocaleString()` date formatting       | `fmtLakeTime()` / `fmtLakeDay()` from `core/time.ts` — every visitor sees **lake time** |
| vue-router (`useRoute`, `RouterLink`)    | `useConditionsState()` — selection state lives in `cc-*` URL params, not routes |
| `px` font sizes                          | `rem` on SiteFarm's scale, or the theme's runtime tokens (`var(--heading-secondary-font-size)` etc.) |

### Step 2 — Pick (or create) the entry

An entry = one script bundle = one Drupal library = one *group* of related
blocks. If your component belongs to an existing feature area, just import
and register it in that entry (most components are children of an existing
block and stop here — only top-level *blocks* need registering).

For a NEW block group, create `vue/entries/my-feature.ts`:

```ts
import { registerBlocks, mountRegistered } from '../lib/mount'
import MyBlock from '../components/MyBlock.vue'

registerBlocks({ 'my-block': MyBlock })
mountRegistered('tercMyFeature') // unique Drupal.behaviors key
```

…and declare its library in `../terc.libraries.yml`:

```yaml
vue-my-feature:
  vite: true
  js:
    vue/entries/my-feature.ts: { attributes: { type: module } }
```

`vite: true` makes the drupal/vite module rewrite the source path through
`dist/.vite/manifest.json` in production (entry CSS included) and proxy to
the dev server during `npm start`.

### Step 3 — Create the PDB component (what makes it a placeable block)

Block exposure uses the contrib **pdb** + **pdb_vue** modules. Each block
gets a directory in the theme root's `components/`:

```
components/my_block/
  my_block.info.yml
  template.html        <div data-terc-block="my-block"></div>
```

Minimal `my_block.info.yml`:

```yaml
name: 'TERC My Block'
machine_name: my-block
type: pdb
description: 'What an editor sees when placing it.'
core_version_requirement: ^9 || ^10 || ^11
presentation: vue
category: 'TERC Lake Conditions'
template: template.html
```

Three integration rules, all learned the careful way:

1. **Never declare assets in the component info.yml.** A `libraries:` key
   there makes pdb_vue force-attach its CDN global Vue next to our bundled
   one, and `add_js:` paths bypass the drupal/vite manifest. Instead, map
   the block's derivative id to its entry library in
   `terc_preprocess_block()` (../terc.theme):

   ```php
   'vue_component:my_block' => 'terc/vue-my-feature',
   ```

2. **Derivative ids use the component FILE basename** (`my_block`), while
   markup uses the yaml `machine_name` (`my-block`). Keep the
   `data-terc-block` value equal to machine_name.
3. **Editor-configurable props**: declare a `configuration:` map in the
   info.yml (Form API elements — see `current_conditions.info.yml` for
   checkboxes). Saved values arrive as
   `drupalSettings.pdb.configuration[<uuid>]` and `lib/mount.ts` merges them
   over `data-terc-props` into your component's props. Checkbox values
   arrive as `0/1` or `'0'/'1'` — normalize like CurrentConditionsShell's
   `asBool()`, and give every prop a default for blocks saved before the
   option existed.

### Step 4 — Build, clear caches, place

```bash
ddev exec "cd docroot/sites/default/themes/terc && npm run build"
ddev drush cr        # block plugins AND library definitions are cached
```

Place the block via the block layout UI or Layout Builder — it appears under
the "TERC Lake Conditions" category. The real placement pattern here is a
plain SiteFarm page with the block visibility set to its path (that's how
`/real-time-conditions` works). Verify at `http://localhost:8080/<path>`.

### Step 5 — Tests (required — CI runs them on every PR)

Add a `__tests__/MyBlock.test.ts` beside the component. House patterns:

- `// @vitest-environment happy-dom` pragma at the top of DOM tests.
- **Never hit the network**: `vi.mock('../../data/stationData', …)` and stub
  `fetch` for JSON:API modules. Existing suites show the shape.
- Components with a library seam (map, charts) are tested through a **fake
  engine/config capture**, not the real library.
- `npm test` and `npm run typecheck` must both pass; the GitHub Actions
  workflow runs exactly these.

### Step 6 — The house rules (reviewed for on every PR)

- **Accessibility is a primary project goal, not a checkbox.** Keyboard path
  for every pointer interaction, `aria-pressed`/`aria-expanded` on toggles,
  visible `:focus-visible` rings, live-region announcements for async
  changes, text alternatives for canvas/map-only content, and WCAG AA
  contrast **verified by computation**.
- **Lake time everywhere.** API timestamps are UTC (the prototype was wrong
  by 7–8 h); display formatting goes through `core/time.ts`.
- **Site content is authoritative; code is the fallback.** Names, bands,
  registry — the Drupal content wins whenever present and valid, and the
  static config renders instantly / covers outages. Never let a live-API
  field overwrite editor content.
- **Honest states.** Empty is normal (say "no data available"), failures are
  data problems (say so — never render an outage as "not reporting"), gaps
  are never interpolated, implausible readings are flagged, offline stations
  are never hidden.
- **Escape anything interpolated into HTML strings** (map tooltips, badge
  markup) — names come from content and the live API.
- **Guard async races.** Loads triggered by fast selection changes use a
  generation token so a stale response can't overwrite a newer one.
- **Keep libraries behind seams.** Leaflet and Chart.js each live in exactly
  one file; new heavyweight dependencies should follow that pattern.

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
(rptdate/rptend) are UTC calendar days too.

## Site-owned content (TERC-46, TERC-52)

- **Registry** — `data/locations.ts` fetches Lake Destinations + Stations
  over the site's JSON:API and adapts them to `DestinationDef` /
  `RegistryStation`. The shell calls `loadRegistry()` on mount; until it
  resolves — or if it fails — components serve the static registry in
  `config/`. Registry names are authoritative over the API's Station_Name.
- **Condition bands** — `data/conditionBands.ts` fetches the
  `condition_bands` taxonomy (label, metric key, exclusive max, tone,
  sentence) and swaps it into `assessMetric()` reactively. Per-metric
  fallback to `config/qualitative.ts`; a metric without an open-ended top
  band is rejected (it would silently mislabel extremes). Band ordering is
  derived from the values, never term weights.
- The **seeder** for both lives in `../scripts/registry-sync/` (own README;
  not web-accessible; moving to a private ops repo with the Lambda work).

## Cache diagnostics overlay (TERC-36)

`components/CacheDiagnostics.vue` renders the live hit/miss/join/prefetch
panel. Enabled per block placement via the "Show cache diagnostics" checkbox
on the block settings form (alongside "Show phase indicator" — which also
controls the Forecasted Conditions placeholder — and "Show data-source
chips"). Only one overlay renders no matter how many blocks enable it.

## Dev workflows

```bash
# Watch + HMR dev server (see settings.local.php 'vite' block to make
# Drupal itself pull from the dev server):
ddev exec "cd docroot/sites/default/themes/terc && npm start"

# Standalone harness (no Drupal) at <dev server URL>/vue/dev.html

# Production build (also runs on npm install via postinstall):
ddev exec "cd docroot/sites/default/themes/terc && npm run build"

# Tests / type-check (what CI runs):
ddev exec "cd docroot/sites/default/themes/terc && npm test"
ddev exec "cd docroot/sites/default/themes/terc && npm run typecheck"
```

After adding a new entry/library or PDB component: `drush cr` (definitions
are cached). The in-app browser can't reach `*.ddev.site` cleanly — use
`http://localhost:8080` (port published in .ddev/docker-compose.localhost.yaml).
