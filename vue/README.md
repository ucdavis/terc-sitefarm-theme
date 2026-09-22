# TERC Vue block bundles

Vue 3 + TypeScript workspace for the progressively decoupled blocks that make
up the Lake Tahoe Conditions features. Ported from the prototype at
`ucdavis/terc-vue-prototype`, hardened for production.

**Where it runs:** the Current Conditions block lives on the
`/real-time-conditions` page (an ordinary SiteFarm page with the block placed
on it). Locally: `http://localhost:8080/real-time-conditions`. Phase 2 is
**Forecasted Conditions** at `/forecasted-conditions` (the prototype called
this "modeled conditions" — use forecast-first wording in anything
user-facing). The weather alerts block (TERC-4) is placeable anywhere.
All three are live on tercdev, which runs **Drupal 11** since September
2026 (local ddev is still 10.6 — see "Drupal 11" below).

## How it fits together

```
vue/
  entries/       One .ts entry per BLOCK GROUP. Each is registered as its own
                 Drupal library in ../terc.libraries.yml (vite: true).
                 current-conditions.ts   -> terc/vue-current-conditions
                 forecasted-conditions.ts -> terc/vue-forecasted-conditions
                 weather-alerts.ts       -> terc/vue-weather-alerts
  components/    Vue SFCs. Top-level blocks (CurrentConditionsShell,
                 ForecastedConditionsShell, WeatherWarningBlock) and their
                 children (LakeMap, FieldStage + the three field views,
                 FieldOverlay, GradientLegend, PlanYourDayView,
                 WaterQualityView, StationCard, WeatherAlertCard, ViewTabs,
                 TimeSeriesChart, SourceBadge, LoadingState,
                 CacheDiagnostics, EndpointDiagnostics) + __tests__/.
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
                 useModelTime / useModeledField / useWaveField
                                     Phase 2: the selected forecast hour and
                                     the grid for each field view
                 useMovablePanel     drag/keyboard-move for overlay panels
  data/          Fetch + adapt layers:
                 stationData.ts      THE interface to the TERC report API —
                                     unit-converted, sentinel-cleaned, sorted
                 locations.ts        site-owned registry over JSON:API
                                     (Lake Destinations + Stations), static
                                     config fallback
                 conditionBands.ts   editor-owned interpretation bands over
                                     JSON:API (condition_bands taxonomy),
                                     code fallback per metric; reads the
                                     TERC-60 brand-color reference
                 modeledGrid.ts / waveHeight.ts / noaa.ts / gridDecode.ts /
                 decodeHost.ts       Phase 2 grids (S3 .npy + STWAVE wave
                                     buckets + NOAA wind), decoded in a
                                     Web Worker when available
                 weatherAlerts.ts    NWS active alerts (+ the archived
                                     sample advisory, nws-sample-alert.json)
  config/        Static config & fallbacks: endpoints, stations,
                 destinations, lakeView/lakeGrid (map framing, grid
                 domain), qualitative.ts (fallback bands + assessMetric +
                 cold-water-shock note), brandPalette.ts (THE source of
                 band chip colors: tone defaults + SiteFarm brand
                 identifiers, contrast-audited by test)
  core/          Plumbing: cache.ts (DataCache: TTL + LRU + in-flight join
                 + persistent tier + last-known rows), requestQueue.ts
                 (bounded, prioritised report-API queue), requestLog.ts
                 (tracedFetch for the endpoint panel), persistentStore.ts /
                 indexedDbStore.ts (the ONLY IndexedDB file), gridWorker.ts
                 (the ONLY Web Worker seam), requestState.ts, timeout.ts,
                 contrast.ts, units.ts, time.ts (UTC parsing, LAKE time)
  map/           engine.ts (map interface) + leafletEngine.ts — the ONLY
                 file that imports Leaflet; tooltipFit.ts, fieldImage.ts,
                 fieldRenderer.ts, fieldSummary.ts. TimeSeriesChart.vue is
                 likewise the only file importing Chart.js. Swappability is
                 tested by driving components with fake engines.
  workers/       grid.worker.ts — pure modules only (no Vue, cache, DOM).
  lib/           mount.ts (data-attribute mounting for Drupal blocks),
                 uniqueId.ts (page-unique ids; NOT useId(), which collides
                 across block apps), blockBool.ts (checkbox settings).
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
`dist/.vite/manifest.json` in production (the entry's OWN CSS included) and
proxy to the dev server during `npm start`.

**CSS shared between entries** (Leaflet's stylesheet, ViewTabs, SourceBadge…)
lands in a shared chunk that the vite module does not attach. `npm run
build` therefore runs `build/shared-css.mjs`, which concatenates every
shared-chunk stylesheet into `dist/vue-shared.css`; that file is a plain
static library (`terc/vue-shared-css`) attached beside each entry in
`terc_preprocess_block()`. Never replace this with a dynamic theme library:
Drupal invokes `hook_library_info_build()` for modules only, and the
version of this that lived in `terc.theme` broke on Drupal 11 (TERC-72).

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
   arrive as `0/1` or `'0'/'1'` (or booleans / `'true'` from template
   props) — normalize with `lib/blockBool.ts`, and give every prop a
   default for blocks saved before the option existed. Textareas work too
   (the Forecasted block's editor-owned copy, TERC-9).

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
- **Keep libraries behind seams.** Leaflet, Chart.js, IndexedDB and the Web
  Worker each live in exactly one file; new heavyweight dependencies should
  follow that pattern. Anything posted to the worker must be a plain object
  (`toRaw` reactive proxies first).
- **Every network call goes through the seams**: `tracedFetch`
  (`core/requestLog.ts`) so the endpoint diagnostics panel sees it, and
  report-API calls through `reportQueue` (`core/requestQueue.ts`) with a
  priority — see "Talking to the report API".

## Talking to the report API (TERC-70)

The report API is slow and fragile: its database saturates, and requests
still waiting at API Gateway's 29-second limit come back **504**. Measured
2026-09-11: 13 concurrent requests → five 504s; a single call costs 2–10 s.
So the data layer does three things, and new code must keep doing them:

- **Queue with priority.** `fetchJsonArray` runs every report request through
  `reportQueue` (`core/requestQueue.ts`), at most **4 in flight**. Callers
  pass `{ priority }`: `'high'` for what the visitor is looking at (selected
  destination, focused station, lake weather), `'low'` for the map's overview
  badges, `'normal'` otherwise. The queue is keyed by URL, so a more urgent
  caller joining an in-flight request moves it up.
- **Last-known readings.** A fetch whose window reaches today is also
  remembered under a window-free key in the persistent tier
  (`DataCache.putStored` / `readStored`; `enableStationPersistence()` in the
  current-conditions entry wires IndexedDB). Views paint those rows at once —
  each dated by its own reading — while the live request waits, then replace
  them. `getOrFetch` never consults them, so nothing stale is served as fresh.
  Lake weather shows "Showing the reading fetched 4:24 PM lake time ·
  updating…", then "Checked 4:31 PM lake time"; on failure it keeps the dated
  reading and says why, with a retry.
- **Honest freshness.** Empty windows are "no data since <last reading>",
  failures and 20-second timeouts are named as such; never an endless
  skeleton (TERC-62).

Operational tooling for the API lives OUTSIDE this repo (see AGENTS.md):
the AWS monitoring scripts and the station roll-call report.

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
  See "The two-tier registry" below: `config/stations.ts` and
  `config/destinations.ts` are **not** the source of truth, and knowing
  which tier you are looking at saves a lot of confusion.
- **Condition bands** — `data/conditionBands.ts` fetches the
  `condition_bands` taxonomy (label, metric key, exclusive max, tone,
  sentence) and swaps it into `assessMetric()` reactively. Per-metric
  fallback to `config/qualitative.ts`; a metric without an open-ended top
  band is rejected (it would silently mislabel extremes). Band ordering is
  derived from the values, never term weights.
- **Brand colors on bands (TERC-60)** — `condition_bands` terms may reference
  an `sf_branding` term (`field_band_brand_color`, added by
  `../scripts/condition-bands/add-brand-color-field.php`); the adapter reads
  only the brand *identifier* and `config/brandPalette.ts` resolves it to a
  contrast-audited chip treatment. A site without the field degrades to tone
  colors with one console warning.
- The **seeder** for both lives in `../scripts/registry-sync/` (own README;
  not web-accessible).

### The two-tier registry — and why `config/` still matters

A reasonable first question about `config/stations.ts` and
`config/destinations.ts` is "why do these exist, when the site has Lake
Station and Lake Locations content?" They are the **offline tier**, and the
distinction is worth knowing before you edit either file.

Exactly one module reads their values: `data/locations.ts`. Everything else
— `LakeMap`, `PlanYourDayView`, `useDestinationData`, `destinationFraming` —
imports only the `DestinationDef` *type*. So there is one seam, not a web of
them.

`useConditionsState` holds one page-wide `registry`, seeded synchronously
with `staticRegistry()` and replaced when `loadRegistry()` resolves:

| | content tier | fallback tier |
|---|---|---|
| source | Lake Locations + Lake Station nodes, JSON:API | `config/destinations.ts`, `config/stations.ts` |
| built by | `adaptRegistry()` | `staticRegistry()` |
| `fromSite` | `true` | `false` |
| when | every normal page view | JSON:API unreachable, non-OK, **or zero destinations** |

When content loads, it supplies everything — slug, title, coordinates, body
copy, and destination membership from the `field_stations` relationships.
**Nothing from the static files survives.** That is the intended design
(AGENTS.md non-negotiable #3: site content is authoritative, code is
fallback), and it is why the first paint is never an empty map: the static
tier renders instantly from the bundle while the fetch is still in flight.

Two consequences that surprise people:

- **Editing `config/` does not change the live site.** It changes what
  visitors see when the site's own API is down. To change the live map, edit
  the content — by hand, or with `../scripts/registry-sync/` (`--dry-run`
  first, always).
- **The fallback is deliberately not a perfect mirror.** `staticRegistry()`
  adapts only `NEARSHORE_STATIONS`, `NASA_BUOYS` and `MET_STATION`; the
  tc-homewood thermistor chain has no entry, which is why
  `useLakeOverview.ts` carries a `HOMEWOOD_FALLBACK` marker of its own.

**How a destination's zoom is used (TERC-89).** Not as "open at this zoom" —
TERC-74 frames every destination on its own stations, and that fit always
wins. `field_location_zoom` (content) or `zoom` (static tier) is a
**ceiling on the fit**: frame the stations, but never zoom in tighter than
this. It exists for single-station destinations, which the fit would
otherwise open at street level — Glenbrook went from z=14 to z=13. A
destination whose stations already span wider than its zoom is unaffected
(North Lake Tahoe fits at z=11 against a cap of 11.25). No value → no cap →
the pre-TERC-89 behaviour. The ceiling rides through the `MapEngine` seam as
`fitBounds(bounds, { maxZoom })`, so Leaflet stays in `leafletEngine.ts`.

Keep the two tiers in step anyway. When they drift, the bug only appears
during an outage — the worst possible moment to discover it, and the hardest
to reproduce. `config/stations.ts` has a test
(`config/__tests__/stationCoordinates.test.ts`, TERC-79) asserting every
static coordinate still falls in open water.

## Diagnostics panels (TERC-36, TERC-62, TERC-65, TERC-69)

Both block settings forms carry two developer toggles, off by default:

- **Show cache diagnostics** — `CacheDiagnostics.vue`, the live
  hit/miss/join/prefetch/disk overlay (bottom right).
- **Show endpoint diagnostics** — `EndpointDiagnostics.vue`: one row per
  endpoint family the block called — full URL, last request (lake time),
  duration, HTTP result, records/bytes, call and failure counts, last error.
  Movable (drag the ⠿ handle, arrow keys, Home; position remembered) and
  resizable (corner grip, or the ⤡ control: drag, click to maximize/restore,
  arrow keys). It reads `core/requestLog.ts`, which is inert until a block
  enables it, so visitors pay nothing.

Only one instance of each renders no matter how many blocks enable it.

## Weather alerts block (TERC-4, TERC-66)

`WeatherWarningBlock.vue` reads NWS active alerts for zones CAZ072/NVZ002
(`data/weatherAlerts.ts`) and hides itself when none are active. The
"Show a sample alert (testing only)" block setting renders a real archived
Lake Wind Advisory (`data/nws-sample-alert.json`, lazily loaded) with an
unmistakable "Sample alert — not live" badge, so the display can be checked
when nothing is in effect. The full per-alert card is TERC-67.

## Drupal 11

tercdev runs Drupal 11; local ddev is 10.6 until the SiteFarm codebase is
brought across. The one 11-specific lesson so far: themes cannot add
libraries dynamically (see the CSS note in Step 2). Everything else here is
version-neutral. `core_version_requirement: ^9 || ^10 || ^11` stays on the
PDB components.

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
