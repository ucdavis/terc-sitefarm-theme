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
  and both shells deep-link their view (`?cc-view=` / `?fc-view=`).
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
verification.

```bash
npm test              # vitest (host node OK)
npm run typecheck     # vue-tsc
npm run build         # commit dist/ output with your change
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
  class.
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
8. **Type sizing through SiteFarm**: rem on the theme's scale or its runtime
   tokens (`--heading-secondary-font-size`, `--reduced-title-font-size`);
   no px font sizes. (SiteFarm also exposes the whole UC Davis brand palette
   as custom properties — `--arboretum` etc. — relevant to TERC-60.)

## Data & content specifics

- **Report API** (`tepfsail50…/v1/report`): families `ns-station-range`
  (ids 1–12), `met-uscg2020` (id 1), `nasa-tb` (ids 1–4), `tc-homewood`
  (no id — the registry stores it as sourceId null / -1 in code).
  "Missing Authentication Token" = unknown route, not auth. Record order
  differs by endpoint (fetchers re-sort). Sentinel −9.0 = "no reading"
  (`parseReading` is field-aware: valid sub-−9 °C air temps survive).
- **JSON:API**: registry at `/jsonapi/node/lake_locations?include=field_stations`;
  bands at `/jsonapi/taxonomy_term/condition_bands`. Decimal fields
  serialize as **strings** — always `Number()` before comparing/sorting.
  Taxonomy terms default published; nodes needed a published-by-default
  bundle override.
- **Seeder** (`scripts/registry-sync/`, own README): idempotent upserts from
  curated JSON. `--dry-run` first, always. **Never re-run the bands sync
  after editors take ownership** — it overwrites their words and duplicates
  renamed terms. The tercdev sync user is `jsonapi`; role perms must cover
  both node types and `condition_bands` terms.
- **tercdev DB imports**: back up local first (`ddev export-db`), then
  `ddev import-db --file=…/database.sql` from the extracted tar. Local-only
  users/config (not the tercdev block placement — that's in tercdev config)
  are wiped; recheck after import.
- Station coordinates are all **approximate** (labeled so in tooltips) until
  TERC confirms them; several stations are legitimately dark (maintenance,
  funded repairs) — that's the offline-honesty story, not a bug.

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
