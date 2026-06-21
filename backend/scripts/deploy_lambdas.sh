#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
STAGE="${1:-dev}"
CHECKLIST_PATH="docs/E2E_DEPLOY_CHECKLIST.md"

echo "Pre-deploy checklist: ${CHECKLIST_PATH}"

if [[ "${STAGE}" == "prod" && "${CONFIRM_E2E_CHECKLIST:-}" != "true" ]]; then
  cat <<EOF
Refusing production Lambda deploy.

Review ${CHECKLIST_PATH} and rerun with:

  CONFIRM_E2E_CHECKLIST=true backend/scripts/deploy_lambdas.sh prod

EOF
  exit 1
fi

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
  local python_version="$3"
  local zip_path="/tmp/${function_name}.zip"
  local existing_env
  local merged_env
  local credentials_file="aws-export/lambda/${function_name}/creds-sa.json"

  if [[ -n "${GOOGLE_SHEET_CREDENTIALS_FILE:-}" ]]; then
    backend/scripts/package_lambda.sh "${source_dir}" "${zip_path}" "${python_version}"
  elif [[ -f "${credentials_file}" ]]; then
    GOOGLE_SHEET_CREDENTIALS_FILE="${credentials_file}" \
      backend/scripts/package_lambda.sh "${source_dir}" "${zip_path}" "${python_version}"
  else
    backend/scripts/package_lambda.sh "${source_dir}" "${zip_path}" "${python_version}"
  fi
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

configure_events_function_url_cors() {
  local function_name="$1"

  aws lambda update-function-url-config \
    --region "${REGION}" \
    --function-name "${function_name}" \
    --cors '{
      "AllowCredentials": false,
      "AllowHeaders": ["content-type", "authorization", "cache-control", "pragma"],
      "AllowMethods": ["GET", "POST", "PATCH", "DELETE"],
      "AllowOrigins": ["*"],
      "ExposeHeaders": []
    }' >/dev/null

  echo "Updated ${function_name} Function URL CORS for admin methods"
}

deploy_one backend/lambdas/events_service "${EVENTS_FN}" "3.14"
configure_events_function_url_cors "${EVENTS_FN}"
deploy_one backend/lambdas/sotf_mailer "${MAILER_FN}" "3.9"
deploy_one backend/lambdas/create_order "${ORDER_FN}" "3.10"
