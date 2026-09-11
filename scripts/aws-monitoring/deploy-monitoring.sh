#!/usr/bin/env bash
# TERC-70 Phase 3: alerting for the report API and its data (idempotent).
#
#   AWS_PROFILE=terc-cfblack ALERT_EMAIL=you@ucdavis.edu ./deploy-monitoring.sh
#
# Creates/updates, in us-west-2:
#   - SNS topic terc-api-alerts (+ the email subscription; confirm the email once)
#   - the freshness canary Lambda (canary/freshness_canary.py), hourly via EventBridge
#   - CloudWatch alarms → the topic:
#       API 5XX, API p90 latency, RDS CPU, Lambda errors on the report functions,
#       canary errors, and per-source "stopped reporting" (AgeMinutes) for the
#       sources that are live today (LIVE_SOURCES below).
# Everything here is additive and reversible: delete the alarms/topic/function
# to undo. Nothing touches the API, the Lambdas that serve it, or the database.
set -euo pipefail
REGION=${AWS_REGION:-us-west-2}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
TOPIC_NAME=terc-api-alerts
FUNC=terc-freshness-canary
ROLE=terc-freshness-canary-role
API_NAME=terc-stations
STAGE=v1
DB=tercdb
LIVE_SOURCES=${LIVE_SOURCES:-"ns-dollar-point ns-homewood ns-rubicon ns-tahoe-vista ns-timber-cove ns-cedar-point met-uscg2020 nasa-tb1 nasa-tb3 nasa-tb4"}
STALE_MINUTES=${STALE_MINUTES:-180}
: "${ALERT_EMAIL:?set ALERT_EMAIL to the address that should receive alerts}"
HERE=$(cd "$(dirname "$0")" && pwd)

echo "== SNS topic"
TOPIC_ARN=$(aws sns create-topic --name $TOPIC_NAME --region $REGION --query TopicArn --output text)
if ! aws sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN" --region $REGION --query "Subscriptions[?Endpoint=='$ALERT_EMAIL']" --output text | grep -q .; then
  aws sns subscribe --topic-arn "$TOPIC_ARN" --protocol email --notification-endpoint "$ALERT_EMAIL" --region $REGION >/dev/null
  echo "   subscription requested — confirm the email AWS just sent to $ALERT_EMAIL"
fi

echo "== canary role"
if ! aws iam get-role --role-name $ROLE >/dev/null 2>&1; then
  aws iam create-role --role-name $ROLE --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name $ROLE --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  aws iam put-role-policy --role-name $ROLE --policy-name put-metrics --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"cloudwatch:PutMetricData","Resource":"*","Condition":{"StringEquals":{"cloudwatch:namespace":"TERC/StationData"}}}]}'
  sleep 10 # IAM propagation before the first create-function
fi
ROLE_ARN=arn:aws:iam::$ACCOUNT:role/$ROLE

echo "== canary function"
ZIP=$(mktemp -t canary).zip; (cd "$HERE/canary" && zip -q -j "$ZIP" freshness_canary.py)
if aws lambda get-function --function-name $FUNC --region $REGION >/dev/null 2>&1; then
  aws lambda update-function-code --function-name $FUNC --zip-file "fileb://$ZIP" --region $REGION >/dev/null
else
  aws lambda create-function --function-name $FUNC --runtime python3.12 --handler freshness_canary.handler --role $ROLE_ARN --zip-file "fileb://$ZIP" --timeout 300 --memory-size 256 --region $REGION --description "TERC-70: hourly data-freshness canary for the report API" >/dev/null
fi
aws lambda wait function-updated --function-name $FUNC --region $REGION
FUNC_ARN=$(aws lambda get-function --function-name $FUNC --region $REGION --query Configuration.FunctionArn --output text)

echo "== hourly schedule"
aws events put-rule --name $FUNC-hourly --schedule-expression "rate(1 hour)" --state ENABLED --region $REGION >/dev/null
RULE_ARN=$(aws events describe-rule --name $FUNC-hourly --region $REGION --query Arn --output text)
aws lambda add-permission --function-name $FUNC --statement-id events-hourly --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "$RULE_ARN" --region $REGION >/dev/null 2>&1 || true
aws events put-targets --rule $FUNC-hourly --targets "Id=canary,Arn=$FUNC_ARN" --region $REGION >/dev/null

alarm() { # name, description, args...
  local name=$1 desc=$2; shift 2
  aws cloudwatch put-metric-alarm --region $REGION --alarm-name "$name" --alarm-description "$desc" --alarm-actions "$TOPIC_ARN" --ok-actions "$TOPIC_ARN" "$@"
  echo "   $name"
}
echo "== alarms"
alarm "terc-api-5xx" "Report API returned 5XX more than 50 times in 15 minutes (usually the database saturating)." \
  --namespace AWS/ApiGateway --metric-name 5XXError --dimensions Name=ApiName,Value=$API_NAME Name=Stage,Value=$STAGE \
  --statistic Sum --period 900 --evaluation-periods 1 --threshold 50 --comparison-operator GreaterThanThreshold --treat-missing-data notBreaching
alarm "terc-api-latency-p90" "Report API p90 latency above 10 s for 30 minutes." \
  --namespace AWS/ApiGateway --metric-name Latency --dimensions Name=ApiName,Value=$API_NAME Name=Stage,Value=$STAGE \
  --extended-statistic p90 --period 900 --evaluation-periods 2 --threshold 10000 --comparison-operator GreaterThanThreshold --treat-missing-data notBreaching
alarm "terc-rds-cpu" "tercdb CPU above 90% for 30 minutes." \
  --namespace AWS/RDS --metric-name CPUUtilization --dimensions Name=DBInstanceIdentifier,Value=$DB \
  --statistic Average --period 900 --evaluation-periods 2 --threshold 90 --comparison-operator GreaterThanThreshold --treat-missing-data notBreaching
for fn in report-get-ns-system-bydate-range report-get-nasa-system-bydate-range report-get-met-system-uscg2020-bydate-range; do
  alarm "terc-lambda-errors-$fn" "Report Lambda $fn errored more than 20 times in 15 minutes (timeouts count)." \
    --namespace AWS/Lambda --metric-name Errors --dimensions Name=FunctionName,Value=$fn \
    --statistic Sum --period 900 --evaluation-periods 1 --threshold 20 --comparison-operator GreaterThanThreshold --treat-missing-data notBreaching
done
alarm "terc-canary-errors" "The freshness canary itself failed." \
  --namespace AWS/Lambda --metric-name Errors --dimensions Name=FunctionName,Value=$FUNC \
  --statistic Sum --period 3600 --evaluation-periods 1 --threshold 0 --comparison-operator GreaterThanThreshold --treat-missing-data notBreaching
for src in $LIVE_SOURCES; do
  alarm "terc-stale-$src" "$src has not reported for more than $STALE_MINUTES minutes (newest reading via the report API). Ask the science team whether the station is down; if they say it is up, the ingestion pipeline (sync-post-*) needs a look." \
    --namespace TERC/StationData --metric-name AgeMinutes --dimensions Name=Source,Value=$src \
    --statistic Maximum --period 3600 --evaluation-periods 2 --threshold $STALE_MINUTES --comparison-operator GreaterThanThreshold --treat-missing-data breaching
done
echo "== first run"
aws lambda invoke --function-name $FUNC --region $REGION --payload '{}' /dev/stdout >/dev/null && echo
echo "done. Topic: $TOPIC_ARN"
