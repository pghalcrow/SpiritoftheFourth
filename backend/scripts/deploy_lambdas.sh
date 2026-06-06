#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
STAGE="${1:-dev}"

if [[ "${STAGE}" == "prod" ]]; then
  EVENTS_FN="events_service"
  MAILER_FN="sotf_mailer"
  ORDER_FN="create_order"
  TABLE_NAME="sotf-submissions"
else
  EVENTS_FN="dev_events_service"
  MAILER_FN="dev_sotf_mailer"
  ORDER_FN="dev_create_order"
  TABLE_NAME="sotf-submissions-dev"
fi

deploy_one() {
  local source_dir="$1"
  local function_name="$2"
  local zip_path="/tmp/${function_name}.zip"
  local existing_env
  local merged_env

  backend/scripts/package_lambda.sh "${source_dir}" "${zip_path}"
  aws lambda update-function-code \
    --region "${REGION}" \
    --function-name "${function_name}" \
    --zip-file "fileb://${zip_path}" >/dev/null
  aws lambda wait function-updated --region "${REGION}" --function-name "${function_name}"

  existing_env="$(aws lambda get-function-configuration \
    --region "${REGION}" \
    --function-name "${function_name}" \
    --query 'Environment.Variables' \
    --output json)"
  merged_env="$(python3 - "${existing_env}" "${TABLE_NAME}" <<'PY'
import json
import sys

raw_env = sys.argv[1]
table_name = sys.argv[2]

variables = json.loads(raw_env) if raw_env and raw_env != "null" else {}
variables["SUBMISSIONS_TABLE"] = table_name
print(json.dumps({"Variables": variables}, separators=(",", ":")))
PY
)"

  aws lambda update-function-configuration \
    --region "${REGION}" \
    --function-name "${function_name}" \
    --environment "${merged_env}" >/dev/null
  aws lambda wait function-updated --region "${REGION}" --function-name "${function_name}"

  echo "Deployed ${function_name} with SUBMISSIONS_TABLE=${TABLE_NAME}"
}

deploy_one backend/lambdas/events_service "${EVENTS_FN}"
deploy_one backend/lambdas/sotf_mailer "${MAILER_FN}"
deploy_one backend/lambdas/create_order "${ORDER_FN}"
