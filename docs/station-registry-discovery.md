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
   (TERC-79 named them: Cascade, Glenbrook, Meeks, Camp Richardson.)
2. Confirm the coordinates. TERC-79 replaced the eyeballed set — see below —
   but "confirmed by TERC staff" is still true of none of them.
3. Is Sand Harbor (7) expected to return, or retired?
4. What is tc-homewood physically, versus near-shore id 4 "Homewood"?
5. Is Cedar Point (12) the west-shore Cedar Point between Tahoe City and
   Homewood? Two independent sources say yes; our old placeholder had it on
   the east shore, so it is worth one confirmation.
6. Where exactly is the Tahoe City station? TERC's own production app puts
   it 479 m inland, so that value cannot be right.

## Station status, confirmed by TERC (scientist email, Sep 2026)

A TERC scientist answered the station roll-call. This supersedes everything we
had inferred about status, and settles the naming question outright.

**Names.** "My recollection is that the API returns data based on station
name" — and every name he lists matches `/report/ns-stations` exactly, with
zero mismatches. The API's `Station_Name` values are the public-facing names.
He flagged that Camp Richardson, Cedar Point and Glenbrook were *missing* from
the roll-call we sent him: those were our placeholders "NS Station 10",
"NS Station 3" and (already named) Cedar Point. **He does not recognise
stations by id, only by name — never send him an id-keyed question.**

**Count.** He states there are **10 live NS sites** but names nine. The tenth
is **Rubicon**, which is reporting live. He does not mention **Cascade**
(last reading 2017, and on Cascade Lake) or **Meeks** (last reading 2020) at
all; both look decommissioned.

| station | scientist's status | last reading |
|---------|--------------------|--------------|
| Dollar Point | working | live |
| Homewood | working | live |
| Tahoe Vista | working | live |
| Rubicon | *(absent from his list; it is the tenth live site)* | live |
| Sand Harbor | removed for construction; redeploy in the fall | transmitting, water fields null |
| Timber Cove | in-water sensors out of the water; "any data that comes through is just atmospheric pressure" | transmitting, water fields null |
| Cedar Point | damaged/out of lake | transmitting, water fields null |
| Camp Richardson | damaged/out of lake | 2025-04-22 |
| Tahoe City | damaged; awaiting sensor from manufacturer | 2026-01-16 |
| Glenbrook | "thought it was working, but it seems something happened" | 2022-08-26 |
| Homewood TC | chain (temps at depth + DO at bottom + pressure), own table; out of the water, damaged | 2026-04 |
| USCG met, NASA TB2 | not his to answer — referred on, no reply yet | — |

**Correction to our own earlier note:** Camp Richardson last reported
2025-04-22, so "never observed 2024–2026" was wrong.

**A trap worth naming.** Three stations the scientist calls out-of-lake are
still transmitting. Their rows carry null in every water field (and
`Depth_m4C_Avg` null), so they render correctly as "no data available" — but
**a live row is not proof a sensor is wet.** The stations that are genuinely in
the water all report `Depth_m4C_Avg` of 1.4–2.0 m; the out-of-lake ones report
none. That is the signal to trust.

## Coordinates (TERC-79, 2026-09-15)

**The report API has none.** Not "we could not find them" — each
`report-get-*` Lambda builds an explicit dict of the fields it returns and
no coordinate appears in any of them. What the API *does* have is
`GET /report/ns-stations`, a roster that states its own id→name mapping;
that corrected four names we had as placeholders, and one of those
(id 3 = Glenbrook, east shore) had been sitting 19 km away.

Coordinates now come from a **reconciliation of three sources**:

1. **TERC's own production real-time app** — `src/static/data_stations.json` in
   the public repo behind the GitHub Pages build that
   `tahoe.ucdavis.edu/real-time-conditions` embeds in an iframe. Keyed by the
   same station ids; last touched 2025-06-02. Note it is a UC Davis ECS 193A
   student-team repo that TERC embeds, not a curated TERC dataset.
2. **An older legacy station table** (`NEAR_SHORE_STATION_INFO`), surfaced
   during this ticket.
3. **OSM geocoding**, for the three neither of the above places in water.

**The two datasets disagree by up to 2.1 km**, so they needed a tiebreaker, and
the stations supply one: every station reporting a depth reports **1.4–2.0 m**
(`Depth_m4C_Avg` — Dollar Point 2.019, Homewood 2.007, Rubicon 2.039, Tahoe
Vista 1.713, Meeks 1.426). These are sensors on **private docks** in shallow
water, which matches TERC's nearshore page crediting lakefront owners for
"access to docks". So the rule is: **take the in-water candidate closest to
shore, reject any candidate on land.** Every nearshore station now sits
12–134 m offshore, against 26–542 m before reconciling.

| id | station | chosen source | offshore | sources apart |
|----|---------|---------------|----------|---------------|
| 2 | Dollar Point | legacy | 83 m | 1232 m |
| 3 | Glenbrook | app | 64 m | 93 m |
| 4 | Homewood | legacy | 12 m | 1139 m |
| 6 | Rubicon | app | 48 m | 516 m |
| 7 | Sand Harbor | app | 33 m | 44 m |
| 8 | Tahoe Vista | app | 26 m | app only |
| 9 | Tahoe City | derived | 73 m | 2111 m, **both on land** |
| 10 | Camp Richardson | app | 104 m | 197 m |
| 11 | Timber Cove | derived | 72 m | 374 m |
| 12 | Cedar Point | app | 134 m | app only |

Cross-checks run:

- Every coordinate tested against OpenStreetMap's Lake Tahoe polygon
  (relation 1823287, 495.3 km² against the lake's actual ~496 km²).
  **Before: 11 of 18 markers were on dry land. After: 0.**
- Independently sampled the **rendered OSM basemap pixel** at each final
  coordinate: 13 of 15 land exactly on water blue. The two exceptions are
  both benign — Cascade reads as a lake label at z16 and is clean water at
  z17, and **Rubicon lands on a single land-coloured pixel with water on
  both sides at the same latitude, i.e. a pier** — which is precisely where
  a dock-mounted sensor belongs.
- The stations whose placement had been most suspect — Cedar Point,
  Glenbrook, Camp Richardson, Timber Cove, USCG — were independently
  geocoded from OSM and agreed with the adopted values.
- **Cascade is on Cascade Lake, not Lake Tahoe** — TERC's own nearshore
  page describes the network as ten Tahoe stations "and an additional
  station on Cascade Lake". Its marker is correctly outside the Tahoe
  polygon, and `stationCoordinates.test.ts` encodes that exception by id.
- Legacy's "Tahoe City" (39.152, -120.147) is 1.9 km from the village and
  200 m from the Cedar Point station — and that table has no Cedar Point
  row, so it looks like a mix-up. Not used.

Precision is now uniformly **five decimals**. Mixed precision (2–4) was the
actual TERC-79 bug: at this latitude a degree of longitude is 86.4 km, so a
two-decimal value carries ±432 m of slop, and three of these stations sit
less than 70 m off the shoreline.

## Reproduction

The sweep scripts are throwaway probes of public GET endpoints; re-run by
sweeping the same id/date matrices. Record counts above are per one-week
window unless noted.
