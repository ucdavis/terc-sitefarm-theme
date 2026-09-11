#!/usr/bin/env bash
# TERC-70 Phase 2: API Gateway response cache for the /report/* GET methods.
#
#   AWS_PROFILE=terc-cfblack ./enable-api-cache.sh            # dry run: prints what it would do
#   AWS_PROFILE=terc-cfblack APPLY=1 ./enable-api-cache.sh    # applies and deploys stage v1
#
# What it does: turns on the stage cache cluster (0.5 GB, ≈ $14/month), keys
# every /report/* GET on its id/rptdate/rptend query parameters, caches ONLY
# those methods for TTL seconds (default 300), and redeploys the stage. The
# /sync/* endpoints the station relay uses are left uncached on purpose —
# a cached "last sync" answer would make the relay re-send rows.
# Undo: APPLY=1 DISABLE=1 ./enable-api-cache.sh
set -euo pipefail
REGION=${AWS_REGION:-us-west-2}
API=tepfsail50
STAGE=v1
TTL=${TTL:-300}
run() { if [ "${APPLY:-0}" = 1 ]; then "$@"; else echo "+ $*"; fi; }
KEYED=""  # "id path" lines for the methods that received cache keys

RESOURCES=$(aws apigateway get-resources --rest-api-id $API --region $REGION --limit 500 --query 'items[?starts_with(path, `/report/`) && contains(keys(resourceMethods || `{}`), `GET`)].[id,path]' --output text)
if [ "${DISABLE:-0}" = 1 ]; then
  run aws apigateway update-stage --rest-api-id $API --stage-name $STAGE --region $REGION --patch-operations op=replace,path=/cacheClusterEnabled,value=false
  exit 0
fi
echo "== cache keys on each /report/* GET: the query parameters the method declares"
while read -r id path; do
  [ -z "$id" ] && continue
  # Only declared method request parameters may be cache keys; each report
  # method declares its own set (most: id/rptdate/rptend; tc-homewood has no id).
  PARAMS=$(aws apigateway get-method --rest-api-id $API --resource-id "$id" --http-method GET --region $REGION --query 'keys(requestParameters || `{}`)' --output text | tr '\t' '\n' | grep '^method.request.querystring\.' || true)
  if [ -z "$PARAMS" ]; then echo "   $path — no query parameters declared; skipped (would cache one answer for every query)"; continue; fi
  OPS=(); for prm in $PARAMS; do OPS+=("op=add,path=/cacheKeyParameters,value=$prm"); done
  echo "   $path ← $(echo $PARAMS | tr ' ' ',' | sed 's/method.request.querystring.//g')"
  run aws apigateway update-integration --rest-api-id $API --resource-id "$id" --http-method GET --region $REGION --patch-operations "${OPS[@]}"
  KEYED="$KEYED
$id $path"
done <<< "$RESOURCES"
echo "== stage cache cluster + per-method caching"
run aws apigateway update-stage --rest-api-id $API --stage-name $STAGE --region $REGION --patch-operations \
  op=replace,path=/cacheClusterEnabled,value=true op=replace,path=/cacheClusterSize,value=0.5 \
  op=replace,path=/*/*/caching/enabled,value=false
while read -r id path; do
  [ -z "$id" ] && continue
  esc=$(printf '%s' "$path" | sed 's#/#~1#g')
  run aws apigateway update-stage --rest-api-id $API --stage-name $STAGE --region $REGION --patch-operations \
    "op=replace,path=$esc/GET/caching/enabled,value=true" "op=replace,path=$esc/GET/caching/ttlInSeconds,value=$TTL"
done <<< "$KEYED"
echo "== deploy"
run aws apigateway create-deployment --rest-api-id $API --stage-name $STAGE --region $REGION --description "TERC-70: cache keys on /report/* GET"
[ "${APPLY:-0}" = 1 ] || echo "(dry run — set APPLY=1 to apply)"
