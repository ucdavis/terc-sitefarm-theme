# Agent guide — TERC SiteFarm sub-theme

Guidance for any coding agent working in this repo. The deep how-to for
building Vue block components is **[vue/README.md](vue/README.md)** — read its
"From prototype component to decoupled block" section before creating or
porting any component. This file covers what that one doesn't: project
context, workflow, environment, and the non-negotiables.

## What this is

The `terc` sub-theme (SiteFarm/Drupal 10, UC Davis Site Factory) plus a Vue 3
+ TypeScript workspace (`vue/`) providing progressively decoupled blocks for
Lake Tahoe conditions data. Jira project **TERC** on ucdavis.jira.com; the
Vue prototype being ported lives at `~/Apps/terc-experiments/terc-proto-1`.

- **The block lives at `/real-time-conditions`** (a SiteFarm page; block
  `terc_terccurrentconditions` with request-path visibility). **Never place
  it on the homepage.**
- Phase 2 is **"Forecasted Conditions"** at `/forecasted-conditions` (block
  `terc_tercforecastedconditions`; live on tercdev) — forecast-first wording
  everywhere user-facing; the prototype's "modeled conditions" survives only
  as a technical term for the grid data. The two pages cross-link, on
  editor-configurable paths (`forecastPath` / `realTimePath` block settings),
  and both shells deep-link their view (`?cc-view=` / `?fc-view=`). Both
  share one layout: a sticky 480×780 lake-framing map column (Real-Time:
  badges; Forecasted: the field map with its vertical colorbar beside it)
  and a reading column to its right; a single stack below 900 px (TERC-64,
  TERC-71).
- The **weather alerts** block (`vue_component:weather_alerts`, TERC-4) can
  be placed anywhere; its "sample alert" setting exists for testing only.
- **tercdev runs Drupal 11** (since 2026-09); local ddev is still 10.6.
  Themes cannot add libraries dynamically on 11 — shared-chunk CSS is a
  static library built by `build/shared-css.mjs` (TERC-72, vue/README.md).
- This repo deploys into the public docroot on Site Factory. `scripts/` is
  blocked from web access by `.htaccess` (Apache prod; local ddev is nginx
  and ignores it). The GitHub repo is public: **no secrets, ever** —
  credentials go in gitignored `.env` files, and the WAF bypass header's
  real name lives only in `.env` and Cloudflare.

## Environment & commands

Local site: ddev project at `~/Sites/terc` (this repo is
`docroot/sites/default/themes/terc` inside it). The in-app browser mangles
`*.ddev.site` — browse/verify at **http://localhost:8080** (port published
via `.ddev/docker-compose.localhost.yaml`); Playwright works well for
verification (its viewport emulation is trustworthy; the in-app pane's is
not). The host shell may resolve an old Node first — `.nvmrc` pins v24;
prefix `PATH` with `~/.nvm/versions/node/v24.7.0/bin` if `npm test` fails
on `??=`.

```bash
npm test              # vitest (host node OK)
npm run typecheck     # vue-tsc
npm run build         # commit dist/ output with your change (vite build +
                      # build/shared-css.mjs → dist/vue-shared.css, TERC-72)
ddev drush cr         # ALWAYS after build/info.yml/library changes
```

Host node is fine for tests; the lockfile was generated with npm 10 and CI
pins Node via `.nvmrc` — don't regenerate `package-lock.json` with other
majors. CI (`.github/workflows/tests.yml`) runs exactly `npm ci
--ignore-scripts`, `npm test`, `npm run typecheck` — Vue component tests
only, never the SiteFarm asset pipeline.

`ddev drush php:eval` is the tool for one-off Drupal state (content edits for
live-proof tests, config checks). Ignore the local "Cloudflare - Credentials"
drush warning — imported config expecting creds the local site lacks.

## Workflow

- **One Jira ticket → one `feature/TERC-NN-slug` branch → one PR.** The user
  merges PRs and says when; transition Jira on their word (or when they
  report a merge). Post substantive completion comments on tickets.
- **Copilot reviews every PR.** Triage each finding: verify it against the
  code, fix what's real (they usually are), push back with reasons where
  it's wrong or disproportionate. Findings often recur across components
  (races, staleness, escaping) — when fixing one instance, sweep for the
  class. Replies are posted in-thread from the user's GitHub session,
  located ONLY by the reply textarea whose id contains `_<threadId>_`
  (outdated threads get a top-level comment naming the file instead).
- **dist/ conflicts** (every branch rebuilds it): merge `main`, `rm -rf
  dist && npm run build`, commit. Never hand-merge dist.
- Follow-up work gets its own ticket and branch, even when small; merged
  branches are deleted locally and on origin.
- Before pushing: tests + typecheck + build green, and **verify live** at
  localhost:8080 (Playwright) — including a content-edit proof when the
  change claims editor ownership (rename a node/term in Drupal, watch the
  UI follow, revert).
- Commit trailer: `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
- Writes to **tercdev** (the shared dev site) only via the seeder, only
  after a `--dry-run` the user has reviewed, and only on their explicit go.

## Non-negotiables (reviewed on every change)

1. **Accessibility is a primary project goal** — never regress it, actively
   raise it. Keyboard path for every pointer interaction; ARIA state on
   toggles; visible `:focus-visible` rings; live-region announcements for
   async changes; text alternatives for canvas/map content; WCAG AA contrast
   **verified by computation, not eyeball**. Map markers must be
   keyboard-focusable with meaningful labels (and focus must survive
   redraws) or have an equivalent non-map control.
2. **Lake time everywhere.** The report API's timestamps are UTC (the
   prototype wrongly assumed Pacific and showed readings 7–8 h in the
   future). All display formatting goes through `vue/core/time.ts`
   (`fmtLakeTime`/`fmtLakeDay`).
3. **Site content is authoritative; code is fallback.** Station/destination
   names (nodes), interpretation bands (`condition_bands` taxonomy) win
   whenever present and valid; static config renders instantly and covers
   outages, per-metric for bands. Never let a live-API field overwrite
   editor content (the API's `Station_Name` is a fallback/diagnostic only).
4. **Honest states.** Empty responses are normal ("no data available");
   fetch failures are data problems and must say so — never rendered as a
   quiet station; offline stations are never hidden from the map; gaps are
   never interpolated; implausible readings are flagged, shown as reported,
   and excluded from interpretation.
5. **Escape anything interpolated into HTML strings** (tooltips, badges) —
   names come from content and the live API.
6. **Guard async races** with generation tokens wherever fast selection
   changes trigger loads.
7. **Library seams**: Leaflet lives only in `vue/map/leafletEngine.ts`,
   Chart.js only in `vue/components/TimeSeriesChart.vue`, IndexedDB only
   in `vue/core/indexedDbStore.ts`, and the Web Worker only in
   `vue/core/gridWorker.ts` (+ `vue/workers/grid.worker.ts`, which imports
   pure modules only — no Vue, no cache, no DOM). Tests drive components
   through fake engines/stores/transports; the thin adapters are verified
   live. New heavy dependencies follow suit. Anything posted to the worker
   must be a plain object: Vue's reactive proxies are not cloneable.
   Report-API calls also go through `reportQueue` (`vue/core/requestQueue.ts`,
   TERC-70): at most 4 in flight, `high` for what the visitor is looking
   at, `low` for the map's overview badges — the API's database saturates
   and anything still waiting at API Gateway's 29 s comes back 504. Views
   paint the "last known reading" rows (`DataCache.putStored/readStored`,
   dated, never served as fresh) while the live request waits.
   Every network call in the data layer goes through `tracedFetch`
   (`vue/core/requestLog.ts`) — a pass-through until a block enables the
   Endpoint diagnostics panel (TERC-62), which is how editors tell a site
   bug from an upstream outage. A bare `fetch(` in `vue/data` is a bug.
8. **Type sizing through SiteFarm**: rem on the theme's scale or its runtime
   tokens (`--heading-secondary-font-size`, `--reduced-title-font-size`);
   no px font sizes — `vue/__tests__/typeSizing.test.ts` scans every
   component and fails on one. (SiteFarm also exposes the whole UC Davis
   brand palette as custom properties — `--arboretum` etc.; band chips use
   the identifiers through `vue/config/brandPalette.ts`, TERC-60.)
9. **Report-API calls are queued and prioritised** (`vue/core/requestQueue.ts`,
   TERC-70): at most 4 in flight, `high` for what the visitor is looking
   at, `low` for overview badges. Views paint last-known readings (dated,
   never served as fresh) while the live request waits. See "The report API
   and its AWS side" below before touching any station fetch.

## The report API and its AWS side (TERC-70)

- The API is API Gateway `tepfsail50` ("terc-stations", stage `v1`) in AWS
  account **946513636404**, us-west-2; `/report/*` GETs invoke
  `report-get-*-bydate-range` Lambdas (Python 3.12, 256 MB, 60 s, in a VPC)
  that call stored procedures on RDS MySQL `tercdb` (db.t3.large). Measured
  2026-09-11: the database at 100 % CPU and its 3,000 IOPS ceiling daily;
  API 5XX 90–511/day, p99 latency 28 s; nearshore calls p50 8.9 s.
- **Ingestion**: a relay at TERC polls `GET /sync/<station>` hourly (last
  stored timestamp) and `POST`s batches through `sync-post-*` Lambdas.
  "Silent" therefore has two meanings: no POSTs arriving (the station or
  relay stopped — a question for the science team) vs POSTs arriving but
  nothing landing where the report procedure reads (a database problem).
- CLI access: an AWS profile in the user's `~/.aws` (`terc-cfblack`, admin).
  Read-only investigation is fine; **every write to that account is
  confirmed with the user first**.
- Operational tooling lives in separate repos, deliberately not here:
  `~/Projects/TERC/AWS/` (freshness canary Lambda, CloudWatch alarms via
  SNS, API Gateway cache script — all dry-run or explicit-apply) and
  `~/Projects/TERC/station-roll-call/` (the "what did the website receive
  from every station" report for the science team). Keep this theme free
  of AWS and reporting scripts.

## Data & content specifics

- **Report API** (`tepfsail50…/v1/report`): families `ns-station-range`
  (ids 1–12), `met-uscg2020` (id 1), `nasa-tb` (ids 1–4), `tc-homewood`
  (no id — the registry stores it as sourceId null / -1 in code).
  "Missing Authentication Token" = unknown route, not auth. Record order
  differs by endpoint (fetchers re-sort). Sentinel −9.0 = "no reading"
  (`parseReading` is field-aware: valid sub-−9 °C air temps survive).
- **NWS alerts**: `https://api.weather.gov/alerts/active?zone=CAZ072,NVZ002`;
  the archive (`/alerts?zone=…&start=…`) keeps past advisories, which is
  where the sample fixture came from.
- **JSON:API**: registry at `/jsonapi/node/lake_locations?include=field_stations`;
  bands at `/jsonapi/taxonomy_term/condition_bands?include=field_band_brand_color`
  (the include is the optional TERC-60 brand-color reference to an
  `sf_branding` term; `scripts/condition-bands/` adds the field). Decimal
  fields serialize as **strings** — always `Number()` before
  comparing/sorting.
  Taxonomy terms default published; nodes needed a published-by-default
  bundle override.
- **Band chip colors** come from ONE place, `vue/config/brandPalette.ts`:
  tone defaults plus SiteFarm brand identifiers → computed, test-audited
  AA chip treatments. Components read `var(--band-bg)`/`var(--band-fg)`
  and own no color hexes. Content supplies identifiers only, never hexes.
- **Seeder** (`scripts/registry-sync/`, own README): idempotent upserts from
  curated JSON. `--dry-run` first, always. **Never re-run the bands sync
  after editors take ownership** — it overwrites their words and duplicates
  renamed terms. The tercdev sync user is `jsonapi`; role perms must cover
  both node types and `condition_bands` terms.
- **tercdev DB imports**: back up local first (`ddev export-db`), then
  `ddev import-db --file=…/database.sql` from the extracted tar. Local-only
  users/config (not the tercdev block placement — that's in tercdev config)
  are wiped; recheck after import.
- Station coordinates come from TERC's own production real-time app and are
  **verified to fall in open water** by `vue/config/__tests__/stationCoordinates.test.ts`
  against an OpenStreetMap shoreline fixture (TERC-79). They are still
  **approximate** (labeled so in tooltips) until TERC confirms them. Two
  rules that test encodes: coordinates are written with **exactly five
  decimals** (two-decimal values carry ±432 m here, which is what used to
  beach markers), and **Cascade (id 1) is on Cascade Lake, not Lake Tahoe** —
  it is meant to sit outside the Tahoe polygon. Several stations are
  legitimately dark (maintenance, funded repairs) — that's the
  offline-honesty story, not a bug.

## Product decisions on record (demo meeting, client-approved)

Plan Your Day defaults to temp/wave/turbidity with a "show more data"
toggle; Water Quality is all-charts, no tiles (Climate Impacts page dropped
into it); cold-water-shock messaging should accompany water temperature —
it does by default on both pages, but it is not a hard requirement: the
Forecasted Conditions block's intro and per-view copy are editor-owned
block settings (TERC-9), so an editor may reword or drop it, and code must
not re-add it unconditionally there; one `condition_bands` vocabulary (not
per-parameter); ~30-min auto-refresh
for kiosks is a pending story; QR posters (TERC-59) and brand-palette band
colors (TERC-60) are specced in the backlog.
