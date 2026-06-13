#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-west-2}"
TABLES=("sotf-submissions-dev" "sotf-submissions")

for table_name in "${TABLES[@]}"; do
  if aws dynamodb describe-table \
    --region "${AWS_REGION}" \
    --table-name "${table_name}" >/dev/null 2>&1; then
    echo "Skipping existing table: ${table_name}"
    continue
  fi

  echo "Creating table: ${table_name}"
  aws dynamodb create-table \
    --region "${AWS_REGION}" \
    --table-name "${table_name}" \
    --attribute-definitions \
      AttributeName=pk,AttributeType=S \
      AttributeName=sk,AttributeType=S \
    --key-schema \
      AttributeName=pk,KeyType=HASH \
      AttributeName=sk,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST >/dev/null

  aws dynamodb wait table-exists \
    --region "${AWS_REGION}" \
    --table-name "${table_name}"
done
