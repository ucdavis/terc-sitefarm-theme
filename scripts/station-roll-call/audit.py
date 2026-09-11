"""
Station roll call, step 1 of 2: ask the report API for every source's last
30 days and record what came back (TERC-70). Sequential requests, 60 s
timeout each. Writes out/station_audit.json; build_report.py turns it into
the page. Usage: python3 audit.py
"""
import json, time, urllib.request, urllib.parse, statistics, datetime as dt, sys
from zoneinfo import ZoneInfo
BASE = "https://tepfsail50.execute-api.us-west-2.amazonaws.com/v1/report"
LAKE = ZoneInfo("America/Los_Angeles")
import os
HERE = os.path.dirname(os.path.abspath(__file__))
reg = json.load(open(os.path.join(HERE, "..", "registry-sync", "registry.data.json")))
OUT = os.environ.get("ROLL_CALL_OUT", os.path.join(HERE, "out"))
os.makedirs(OUT, exist_ok=True)
FAMILY = {"nearshore_station": "ns-station-range", "nasa_buoy": "nasa-tb", "met_station": "met-uscg2020", "tc_homewood": "tc-homewood"}
now = dt.datetime.now(dt.timezone.utc)
day = lambda d: d.strftime("%Y%m%d")
def get(path):
    t0 = time.time()
    try:
        with urllib.request.urlopen(BASE + path, timeout=60) as r:
            body = r.read(); return r.status, round(time.time() - t0, 1), len(body), json.loads(body)
    except urllib.error.HTTPError as e:
        return e.code, round(time.time() - t0, 1), 0, None
    except Exception as e:
        return str(e)[:60], round(time.time() - t0, 1), 0, None
def ts_field(row):
    for k in ("TmStamp", "TIMESTAMP", "Timestamp", "timestamp", "Date", "DateTime", "date"):
        if k in row: return k
    return None
def parse_ts(v):
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%SZ"):
        try: return dt.datetime.strptime(v, fmt).replace(tzinfo=dt.timezone.utc)
        except Exception: pass
    return None
out = []
for s in reg["stations"]:
    fam = FAMILY.get(s["family"], s["family"])
    idq = "" if s.get("id") in (None, -1) else f"id={s['id']}&"
    path = f"/{fam}?{idq}rptdate={day(now - dt.timedelta(days=30))}&rptend={day(now)}"
    status, secs, nbytes, rows = get(path)
    rec = {"family": s["family"], "endpoint": fam, "id": s.get("id"), "name": s["name"], "note": s.get("note"), "verified": s.get("verified"),
           "request": BASE + path, "http": status, "seconds": secs, "bytes": nbytes, "records30d": None, "records24h": None,
           "newest_utc": None, "newest_lake": None, "age_hours": None, "median_interval_min": None, "api_station_name": None, "fields": None, "latest_row": None}
    if isinstance(rows, list):
        rec["records30d"] = len(rows)
        if rows:
            tf = ts_field(rows[0]); rec["fields"] = sorted(rows[0].keys())
            rec["api_station_name"] = rows[0].get("Station_Name")
            times = sorted(t for t in (parse_ts(r.get(tf, "")) for r in rows if tf) if t)
            if times:
                newest = times[-1]; rec["newest_utc"] = newest.isoformat(); rec["newest_lake"] = newest.astimezone(LAKE).strftime("%b %-d, %-I:%M %p")
                rec["age_hours"] = round((now - newest).total_seconds() / 3600, 1)
                rec["records24h"] = sum(1 for t in times if (now - t).total_seconds() <= 86400)
                if len(times) > 5:
                    gaps = [(b - a).total_seconds() / 60 for a, b in zip(times[:-1], times[1:]) if (b - a).total_seconds() > 0]
                    rec["median_interval_min"] = round(statistics.median(gaps), 1) if gaps else None
                # Silences longer than 2 hours inside the window, plus the one running now.
                outages = []
                for a, b in zip(times[:-1], times[1:]):
                    if (b - a).total_seconds() > 7200:
                        outages.append({"from_lake": a.astimezone(LAKE).strftime("%b %-d, %-I:%M %p"), "to_lake": b.astimezone(LAKE).strftime("%b %-d, %-I:%M %p"), "hours": round((b - a).total_seconds() / 3600, 1), "ongoing": False})
                if (now - times[-1]).total_seconds() > 7200:
                    outages.append({"from_lake": times[-1].astimezone(LAKE).strftime("%b %-d, %-I:%M %p"), "to_lake": None, "hours": round((now - times[-1]).total_seconds() / 3600, 1), "ongoing": True})
                rec["outages"] = outages
                rec["first_utc"] = times[0].isoformat(); rec["first_lake"] = times[0].astimezone(LAKE).strftime("%b %-d, %-I:%M %p")
                # daily record counts for a 30-day sparkline
                counts = {}
                for t in times:
                    d = t.astimezone(LAKE).date().isoformat(); counts[d] = counts.get(d, 0) + 1
                rec["daily"] = [{"day": (now.astimezone(LAKE).date() - dt.timedelta(days=i)).isoformat(), "n": counts.get((now.astimezone(LAKE).date() - dt.timedelta(days=i)).isoformat(), 0)} for i in range(29, -1, -1)]
                rec["latest_row"] = max(rows, key=lambda r: parse_ts(r.get(tf, "")) or dt.datetime.min.replace(tzinfo=dt.timezone.utc))
    out.append(rec)
    print(f"{s['name']:<22} {fam:<17} id={str(s.get('id')):<4} http={status} {secs:>5}s rec30d={rec['records30d']} rec24h={rec['records24h']} newest={rec['newest_lake']} age_h={rec['age_hours']} cadence_min={rec['median_interval_min']} api_name={rec['api_station_name']}", flush=True)
json.dump({"generated_utc": now.isoformat(), "generated_lake": now.astimezone(LAKE).strftime("%b %-d, %Y %-I:%M %p"), "stations": out}, open(os.path.join(OUT, "station_audit.json"), "w"), indent=1, default=str)
print("saved")
