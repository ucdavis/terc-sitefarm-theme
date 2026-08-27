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

## Cloudflare / WAF note

`*.sf.ucdavis.edu` sits behind Cloudflare with a managed challenge that
blocks all non-browser clients (the script gets an HTML 403 "Attention
Required" before Drupal is ever reached). The sync needs a WAF exception —
ask whoever administers Cloudflare for the SiteFarm domains for a skip
rule, ideally scoped tight: hostname + path starts-with `/jsonapi/` +
a shared-secret request header. Put that header in `.env` as
`SYNC_HEADER=X-Registry-Sync: <secret>` and the script sends it on every
request. An IP-allowlist rule works too (also what a future Lambda's
egress IP would need).

## Drush path (no Cloudflare, no credentials)

Where JSON:API can't be reached (Cloudflare challenges all non-browser
clients on `*.sf.ucdavis.edu` and the zone is centrally managed), use the
generated drush applier — same curated data, same idempotent upserts,
executed inside Drupal with the entity API:

```bash
node make-plan.mjs                 # discovery + plan -> dist/apply-plan.generated.php
# local:
ddev exec drush scr sites/default/themes/terc/scripts/registry-sync/dist/apply-plan.generated.php -- --dry-run
# tercdev (ACSF alias; copy the file where remote drush can read it, e.g. scp to ~/):
drush @ucdsitefarm.01dev --uri=https://tercdev.sf.ucdavis.edu scr apply-plan.generated.php -- --dry-run
```

Drop `--dry-run` to apply. The applier needs none of the JSON:API/basic-auth
prerequisites above and can set publish status directly; it still skips
`tc_homewood` and station-status writes until the content model has them.
Regenerate (`make-plan.mjs`) whenever registry.data.json changes or to
refresh observed statuses; `--skip-discovery` skips the report-API probe.

## Lambda later

`discoverActivity`/`upsertStation` are plain async functions with env-based
config — wrapping them in an AWS Lambda handler + EventBridge nightly
schedule gives automatic status sync (Secrets Manager for the credentials).
Planned as a follow-up once the seeded registry proves out.
