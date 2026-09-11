"""
Data-freshness canary for the TERC report API (TERC-70).

Runs hourly (EventBridge). For every source the website reads, asks the
report API for yesterday→today, measures how old the newest reading is,
and publishes CloudWatch metrics under the TERC/StationData namespace:

  AgeMinutes   (Source)  minutes since the newest TmStamp; absent when no rows
  Records      (Source)  rows returned for the window
  LatencyMs    (Source)  request round trip
  RequestOk    (Source)  1 = HTTP 200 with a JSON array, 0 = anything else

Alarms on AgeMinutes tell developers "this source stopped reporting" with
the source name, the newest timestamp and the request id in the message —
so the conversation with the science team starts from facts. No secrets:
the API is public. Python 3.12, stdlib + boto3 (present in the runtime).
"""
import json
import os
import time
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BASE = os.environ.get("REPORT_BASE", "https://tepfsail50.execute-api.us-west-2.amazonaws.com/v1/report")
NAMESPACE = "TERC/StationData"
# Source label -> (endpoint, id or None). Keep in step with the website's registry.
SOURCES = {
    "ns-dollar-point": ("ns-station-range", 2),
    "ns-homewood": ("ns-station-range", 4),
    "ns-rubicon": ("ns-station-range", 6),
    "ns-tahoe-vista": ("ns-station-range", 8),
    "ns-timber-cove": ("ns-station-range", 11),
    "ns-cedar-point": ("ns-station-range", 12),
    "ns-cascade-1": ("ns-station-range", 1),
    "ns-glenbrook-3": ("ns-station-range", 3),
    "ns-meeks-5": ("ns-station-range", 5),
    "ns-sand-harbor-7": ("ns-station-range", 7),
    "ns-tahoe-city-9": ("ns-station-range", 9),
    "ns-camp-richardson-10": ("ns-station-range", 10),
    "met-uscg2020": ("met-uscg2020", 1),
    "nasa-tb1": ("nasa-tb", 1),
    "nasa-tb2": ("nasa-tb", 2),
    "nasa-tb3": ("nasa-tb", 3),
    "nasa-tb4": ("nasa-tb", 4),
    "tc-homewood": ("tc-homewood", None),
}


def newest(rows):
    best = None
    for r in rows:
        v = r.get("TmStamp")
        if not v:
            continue
        try:
            t = datetime.strptime(v, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if best is None or t > best:
            best = t
    return best


def probe(endpoint, sid, now):
    start = (now - timedelta(days=1)).strftime("%Y%m%d")
    end = now.strftime("%Y%m%d")
    q = f"id={sid}&" if sid is not None else ""
    url = f"{BASE}/{endpoint}?{q}rptdate={start}&rptend={end}"
    t0 = time.time()
    try:
        with urllib.request.urlopen(url, timeout=55) as res:
            body = json.loads(res.read())
            ok = res.status == 200 and isinstance(body, list)
            rid = res.headers.get("x-amzn-RequestId")
    except Exception as err:  # noqa: BLE001 — the canary reports, it does not fail
        return {"ok": 0, "ms": int((time.time() - t0) * 1000), "rows": None, "newest": None, "error": str(err)[:200], "url": url, "rid": None}
    return {"ok": int(ok), "ms": int((time.time() - t0) * 1000), "rows": len(body) if ok else None, "newest": newest(body) if ok else None, "error": None, "url": url, "rid": rid}


def handler(event, context):
    now = datetime.now(timezone.utc)
    cw = boto3.client("cloudwatch")
    data, summary = [], {}
    for source, (endpoint, sid) in SOURCES.items():
        r = probe(endpoint, sid, now)
        dims = [{"Name": "Source", "Value": source}]
        data.append({"MetricName": "RequestOk", "Dimensions": dims, "Value": r["ok"], "Unit": "None"})
        data.append({"MetricName": "LatencyMs", "Dimensions": dims, "Value": r["ms"], "Unit": "Milliseconds"})
        if r["rows"] is not None:
            data.append({"MetricName": "Records", "Dimensions": dims, "Value": r["rows"], "Unit": "Count"})
        if r["newest"] is not None:
            age = (now - r["newest"]).total_seconds() / 60
            data.append({"MetricName": "AgeMinutes", "Dimensions": dims, "Value": round(age, 1), "Unit": "None"})
        summary[source] = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in r.items()}
    # PutMetricData takes at most 1000 datapoints; we send ~70.
    for i in range(0, len(data), 500):
        cw.put_metric_data(Namespace=NAMESPACE, MetricData=data[i : i + 500])
    print(json.dumps({"at": now.isoformat(), "sources": summary}, default=str))
    return {"sources": len(SOURCES), "metrics": len(data)}
