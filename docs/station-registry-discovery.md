# TERC station registry — empirical discovery (TERC-46)

Sweep of the tepfsail50 report API, run **2026-08-27**, to establish the real
station registry ahead of moving it into the Lake Destinations / Lake
Stations content types. Method: probe every id (`ns-station-range` 1–24,
`nasa-tb` 1–8, `met-uscg2020` 1–4, `tc-homewood`) across seasonal windows —
this week, Jan 2026, Apr 2026, Jul 2025 — then quarterly 2024–2025 windows
for ids never seen, and monthly 2026 windows to date dormant stations'
last activity. A station dormant today still answers for windows in which
it reported, so this catches stations a today-only check misses.

## Near-shore stations (`ns-station-range`, param `id`)

| id | API `Station_Name` | Status (2026-08-27) | Evidence |
|----|--------------------|---------------------|----------|
| 2  | Dollar Point  | **active** | reporting this week |
| 4  | Homewood      | **active** | reporting this week |
| 6  | Rubicon       | **active** | reporting this week |
| 7  | Sand Harbor   | dark since Q4 2024 | 576 rec/wk all 2024 quarters; nothing since |
| 8  | Tahoe Vista   | **active** | reporting this week |
| 9  | Tahoe City    | last seen Jan 2026 | 71–84 rec in Jan windows; nothing after |
| 11 | Timber Cove   | **active** | 119 rec this week — *prototype had this as an unnamed placeholder* |
| 12 | Cedar Point   | **active** | 161 rec this week — *prototype had this as an unnamed placeholder* |
| 1, 3, 5, 10 | — | never observed | empty in every window probed, 2024Q1–now |
| 13–24 | — | not in id space | empty in every window probed |

## Other endpoints

| Endpoint | id | Name | Status (2026-08-27) |
|----------|----|------|---------------------|
| nasa-tb | 1 | tb1 | **active** |
| nasa-tb | 2 | tb2 | **active but quiet ~10 days** — reported every month of 2026 incl. early Aug |
| nasa-tb | 3 | tb3 | **active** |
| nasa-tb | 4 | tb4 | **active** |
| nasa-tb | 5–8 | — | not in id space |
| met-uscg2020 | 1 | USCG2020 | **active** |
| met-uscg2020 | 2–4 | — | not in id space |
| tc-homewood | (none) | — | last seen Apr 2026 (445 rec in Apr window) — the prototype's "always empty" note was bad timing |

## What this means for content entry (Lake Stations seed sheet)

Eight real near-shore stations exist, not four. Suggested initial
`field_station_status` values: `active` for ids 2, 4, 6, 8, 11, 12, the
four buoys, and USCG2020; `maintenance` for Tahoe City (9), Sand Harbor
(7), and tc-homewood (dormant but historically real — keep on the map per
the product rule).

Open questions for TERC staff:
1. Are ids 1, 3, 5, 10 future/retired/dead? Nothing observed 2024–2026.
2. Authoritative coordinates for every station — the API returns none, and
   the code's coordinates are eyeballed (now against the *correct* names,
   but still approximate).
3. Is Sand Harbor (7) expected to return, or retired?
4. What is tc-homewood physically, versus near-shore id 4 "Homewood"?

## Reproduction

The sweep scripts are throwaway probes of public GET endpoints; re-run by
sweeping the same id/date matrices. Record counts above are per one-week
window unless noted.
