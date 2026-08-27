# Registry sync (TERC-46)

Seeds/updates **Lake Station** and **Lake Destinations** nodes over JSON:API
from `registry.data.json` (the curated source of truth: coordinates, slugs,
destination groupings) enriched with live activity observed on the TERC
report API. Idempotent — safe to re-run; it PATCHes only what differs.

## Site prerequisites (once per environment)

1. `jsonapi.settings read_only: false` (JSON:API defaults to read-only).
2. Core `basic_auth` module enabled.
3. A dedicated role + user with ONLY:
   - create/edit any `station` content
   - create/edit any `lake_locations` content
   - access content, view own unpublished content
4. **Both content types must default to Published** — core only lets
   `administer nodes` accounts set status through the API, so the sync
   relies on the bundle default.

## Running

```bash
cp .env.example .env   # fill in; .env is gitignored
set -a; source .env; set +a
node sync.mjs --dry-run   # ALWAYS review the plan first
node sync.mjs             # then write
```

Flags: `--dry-run` (print the plan, write nothing), `--skip-discovery`
(skip the report-API activity probe; faster, no status/name checks),
`--stations-only` (leave destination nodes alone — use once editors own
destination content).

Exit code 2 means some items were skipped (see `skip`/`warn` lines) —
currently expected for `tc_homewood` until that value is added to
`field_station_type`, and for `field_station_status` writes until that
field exists.

## Curation policy

- **Coordinates and display names come from `registry.data.json` only** —
  reviewed once, applied mechanically (this is the typo defense).
  The API's `Station_Name` is compared and surfaced as a `note` when it
  differs, never written.
- Observed activity maps to `field_station_status` (`active` = data in the
  last 3 days, `maintenance` = historical data only) once the field exists.
- Never-observed stations are still created (per product rule: stations
  stay on the map), noted in the data file.

## Lambda later

`discoverActivity`/`upsertStation` are plain async functions with env-based
config — wrapping them in an AWS Lambda handler + EventBridge nightly
schedule gives automatic status sync (Secrets Manager for the credentials).
Planned as a follow-up once the seeded registry proves out.
