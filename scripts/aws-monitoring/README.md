# AWS monitoring and API cache (TERC-70)

Scripts for the AWS account that hosts the report API (`terc-stations`,
`tepfsail50`, us-west-2). All use the AWS CLI with whatever profile you pass;
nothing here stores credentials. Read each script's header before running.

| Script | What it does | Writes to AWS? |
|---|---|---|
| `deploy-monitoring.sh` | SNS topic + email, hourly freshness canary Lambda, CloudWatch alarms (API 5XX/latency, RDS CPU, Lambda errors, per-source "stopped reporting") | Yes (additive, reversible) |
| `enable-api-cache.sh` | API Gateway response cache for `/report/*` GET, keyed on id/rptdate/rptend, 5-minute TTL; dry run by default | Only with `APPLY=1` |
| `canary/freshness_canary.py` | The canary's code: probes every source, publishes `TERC/StationData` metrics | via the Lambda |

Why (measured 2026-09-11): the website's ~18 concurrent report requests hit
a database at 100% CPU / 3,000 IOPS, the API returned 90–511 5XX per day,
p99 latency 28 s. The cache answers repeat questions without touching the
database; the alarms tell developers when the API or a station goes quiet
so the science team can be asked with facts in hand.
