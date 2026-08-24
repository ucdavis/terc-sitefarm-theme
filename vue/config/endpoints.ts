/**
 * All base URLs in one place so switching between direct and proxied access is
 * a one-line change per host.
 *
 * CORS status:
 *  - tepfsail50 (API Gateway):  Access-Control-Allow-Origin: *  -> direct OK
 *  - api.weather.gov:           Access-Control-Allow-Origin: *  -> direct OK
 *  - lake-tahoe-conditions S3:  Access-Control-Allow-Origin: *  -> direct OK
 *
 * ⚠ NOTE: the S3 bucket's CORS policy CHANGED during this project. On
 * 2026-07-29 it returned no ACAO header at all and had to be proxied through
 * the Vite dev server; by 2026-07-31 it returned `ACAO: *` with
 * `Access-Control-Allow-Methods: GET` on every path (contents.json,
 * temperature/, flow/, waveheight/). Direct access is what makes static
 * hosting (GitHub Pages) possible — a proxy is not available there.

 */

/** Phase 1 — TERC REST report API (near-shore stations, met, NASA buoys). */
export const REPORT_BASE =
  'https://tepfsail50.execute-api.us-west-2.amazonaws.com/v1/report'

/** Phase 2 — modeled grids + precomputed wave solutions.
 *  (The prototype had a Vite dev-proxy fallback for the 2026-07-29 CORS
 *  outage; the theme build defines no proxy, so S3 is always direct. If
 *  TERC's S3 CORS policy is ever removed again, phase 2 needs a proxy
 *  route — see the prototype's vite.config.ts for the shape.) */
export const S3_BASE = 'https://lake-tahoe-conditions.s3.us-west-2.amazonaws.com'

/** Phase 2 — NOAA gridpoint forecast used for wave-height bucket selection.
 *  Keyless. Resolves to (-120.03, 39.05), Reno forecast office. */
export const NOAA_GRIDPOINT = 'https://api.weather.gov/gridpoints/REV/33,87'

/** Phase 3 — NWS active watches/warnings/advisories (keyless).
 *
 *  Lake Tahoe spans TWO forecast zones (verified via /points for the west,
 *  south, and east shores):
 *    CAZ072 — Greater Lake Tahoe Area, California
 *    NVZ002 — Greater Lake Tahoe Area, Nevada
 *
 *  A single `?zone=CAZ072,NVZ002` query returns alerts affecting EITHER zone
 *  in one combined FeatureCollection, de-duplicated server-side.
 *
 *  NOTE: a `?point=lat,lon` query (as in some NWS examples) resolves to only
 *  ONE zone — the point 39.0968,-120.0324 lands in CAZ072 and would silently
 *  miss Nevada-side alerts. The zone query is used deliberately so both
 *  shores are covered. */
export const NOAA_ALERTS = 'https://api.weather.gov/alerts/active'
export const TAHOE_ALERT_ZONES = ['CAZ072', 'NVZ002']

/** Friendly labels for the monitored zones, shown in the Phase 3 view. */
export const TAHOE_ZONE_LABELS: Record<string, string> = {
  CAZ072: 'Greater Lake Tahoe Area, California',
  NVZ002: 'Greater Lake Tahoe Area, Nevada',
}
