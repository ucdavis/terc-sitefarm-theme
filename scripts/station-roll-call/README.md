# Station roll call

A report for the TERC science team: what the website received from every
monitoring source over the last 30 days, straight from the report API, with
the questions to ask ("is this station really down?"). Built for TERC-70.

```bash
cd scripts/station-roll-call
python3 audit.py          # ~1–2 min: 18 sequential requests → out/station_audit.json
python3 build_report.py   # → out/tahoe-station-roll-call.html (open in a browser, or publish)
```

- Sources come from `../registry-sync/registry.data.json` (names, families, ids).
- Timestamps from the API are UTC; the page shows lake time.
- "Reporting / Delayed / Silent / No data" is judged only by the age of the
  newest record the API returned. A source can be healthy at the lake and
  still show as silent here if data is not reaching the API — that is the
  question the report exists to ask.
- `extra_questions.html` holds the standing questions appended to the list;
  edit it as the situation changes.
- `out/` is ignored by git.
