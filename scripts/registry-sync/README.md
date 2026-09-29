# Registry sync (TERC-46, TERC-52)

Seeds/updates **Lake Station** and **Lake Destinations** nodes over JSON:API
from `registry.data.json` (the curated source of truth: coordinates, slugs,
destination groupings) enriched with live activity observed on the TERC
report API, plus the **condition_bands** taxonomy terms from
`bands.data.json` (TERC-52 interpretation bands: metric, threshold, tone,
sentence). Idempotent — safe to re-run; it PATCHes only what differs.

## Site prerequisites (once per environment)

1. `jsonapi.settings read_only: false` (JSON:API defaults to read-only).
2. Core `basic_auth` module enabled.
3. A dedicated role + user with ONLY:
   - create/edit any `station` content
   - create/edit any `lake_locations` content
   - create/edit terms in `condition_bands`
   - access content, view own unpublished content
4. **Both content types must default to Published** — core only lets
   `administer nodes` accounts set status through the API, so the sync
   relies on the bundle default. (Taxonomy terms are published by default;
   no equivalent step needed for bands.)

## Running

```bash
cp .env.example .env   # fill in; .env is gitignored
set -a; source .env; set +a
node sync.mjs --dry-run   # ALWAYS review the plan first
node sync.mjs             # then write
```

Flags: `--dry-run` (print the plan, write nothing), `--skip-discovery`
(skip the report-API activity probe; faster, no status/name checks),
`--stations-only` (stations only — no destinations, no bands),
`--bands-only` (condition_bands terms only — no stations/destinations,
no discovery), `--skip-bands` (stations **and destinations**, but leave
condition_bands alone).

**Use `--skip-bands` to push registry changes to a live site.** Destinations
only sync in the "everything" mode, so before this flag existed the only way
to update a Lake Location also re-ran the bands sync — which overwrites any
wording editors have changed in Drupal. Once editors own the bands, this is
the safe command:

```bash
node sync.mjs --dry-run --skip-bands   # review first
node sync.mjs --skip-bands
```

**Zoom (TERC-89).** Each destination in `registry.data.json` carries a
`zoom`, written to `field_location_zoom` on the Lake Locations type. The
field must be **decimal** (or float): the half-lake destinations use `11.25`,
which an integer field rejects. The value is compared with `Number()` because
JSON:API serializes a decimal field as a string (`"11.25"`), so a string
comparison would report a change on every run. A site without the field
still syncs — the run warns once and skips zoom.

**Optional fields are detected from the schema, not from existing content**
(`field_station_status`, `field_location_zoom`). The sync filters on the
field with `IS NULL`: JSON:API answers 200 for a real field even when no node
exists yet, and 400 for one that is not on the bundle. An earlier version
read the attribute keys off the first existing node, which on a site with no
content yet — a first sync to prod — reported every optional field as missing.

**On a first sync to an empty site, the dry run shows what will be written.**
Station `create` lines carry `[status: …]` and destination lines `[zoom: …]`.
Destination → station references resolve against the stations that same run
will create; an `unresolved station refs` warning therefore means a real
problem, such as a typo'd key in `registry.data.json`.

**Against local ddev, use `DRUPAL_BASE_URL=http://127.0.0.1:8080`, not
`localhost`.** Node resolves `localhost` to IPv6 first, Docker publishes the
port on IPv4 only, and every request fails with a bare `fetch failed`.

The value is a **ceiling**, not a set zoom: the map fits each destination to
its own stations and this stops the fit zooming in any tighter (see "How a
destination's zoom is used" in `vue/README.md`). Raising it therefore can
only matter for a destination whose stations are close together; lowering it
widens every view tighter than the new value. Leave the field empty to let
the fit decide alone.

**Bands and editor ownership:** band upserts are keyed by
`(field_metric_key, name)`. Once editors start refining bands in Drupal,
a re-run OVERWRITES their threshold/tone/sentence edits with the curated
file, and a term an editor RENAMED no longer matches its curated row — the
old name gets re-created alongside it as a duplicate. After editorial
handoff, treat bands syncing as a deliberate reset: always `--dry-run`
first and read the `update`/`create` lines, or stick to `--stations-only`.

Exit code 2 means some items were skipped (see `skip`/`warn` lines) —
currently expected for `tc_homewood` until that value is added to
`field_station_type`, and for `field_station_status` writes until that
field exists.

## Curation policy

- **Coordinates and display names come from `registry.data.json` only** —
  reviewed once, applied mechanically (this is the typo defense).
  The API's `Station_Name` is compared and surfaced as a `note` when it
  differs, never written.
- **Station status is curated when the file has it** (TERC-96). A station's
  `"status"` in `registry.data.json` is written as-is; `"status": null`
  writes nothing. Only a station with no `status` key falls back to observed
  activity (`active` = data in the last 3 days, `maintenance` = historical
  data only). The dry run adds a `note` when activity disagrees with the
  curated value, but the curated value is kept: activity cannot tell a
  working sensor from one that transmits barometric pressure out of the
  water.
- Coordinates count as unchanged within half a unit of the fifth decimal,
  so rounded values pulled from the site don't re-write it.
- Never-observed stations are still created (per product rule: stations
  stay on the map), noted in the data file.

## Pulling the site's edits back (TERC-96)

Editors own this content once it's seeded: they move destinations on the
map, change zooms, and add destinations. Before a re-seed, bring those edits
back into the file, or the seed will undo them:

```bash
node pull.mjs            # report what differs from the site (prod by default)
node pull.mjs --write    # update registry.data.json
PULL_BASE_URL=https://tercdev.sf.ucdavis.edu node pull.mjs
```

It is read-only against the site: public JSON:API GETs, no credentials.
It carries back station names, coordinates and statuses, plus destination
names, coordinates, zooms and station lists, and it keeps the file's notes.
Coordinates are rounded to five decimals. Then mirror the destinations in
`vue/config/destinations.ts` (the static fallback). `destinationsFallback.test.ts`
fails until the two match. A `sync.mjs --dry-run` straight after a pull should
report every item `ok`.

## Cloudflare / WAF note

`*.sf.ucdavis.edu` sits behind Cloudflare with a managed challenge that
blocks all non-browser clients (the script gets an HTML 403 "Attention
Required" before Drupal is ever reached). The sync needs a WAF exception —
ask whoever administers Cloudflare for the SiteFarm domains for a skip
rule, ideally scoped tight: hostname + path starts-with `/jsonapi/` +
a shared-secret request header. Put that header in `.env` as
`SYNC_HEADER=<Header-Name>: <secret>` (the real header name lives only in
`.env` and the Cloudflare rule, never in the repo) and the script sends it on every
request. An IP-allowlist rule works too (also what a future Lambda's
egress IP would need).

## No Drush path (TERC-90)

There used to be a generated Drush applier here (`make-plan.mjs` +
`apply-plan.template.php`) for when JSON:API was unreachable. It is gone:
SiteFarm **rejects a custom theme containing PHP**, and installing the theme on
prod failed on that template. It is archived at
`~/Projects/TERC/drupal-php-scripts/` for reference.

It is not needed. `sync.mjs` reaches prod over JSON:API — a dry run against
tahoe.ucdavis.edu went through end to end — and where it cannot be used, the
same data can be entered by hand: `docs/manual-site-setup.md` §2 maps every
field in `registry.data.json` to its admin-UI field.

## Lambda later

`discoverActivity`/`upsertStation` are plain async functions with env-based
config — wrapping them in an AWS Lambda handler + EventBridge nightly
schedule gives automatic status sync (Secrets Manager for the credentials).
Planned as a follow-up once the seeded registry proves out.
