#!/usr/bin/env bash
set -euo pipefail

LAMBDA_DIR="$1"
OUT_ZIP="$2"

rm -rf /tmp/sotf-lambda-package
mkdir -p /tmp/sotf-lambda-package

rsync -a "${LAMBDA_DIR}/" /tmp/sotf-lambda-package/
mkdir -p /tmp/sotf-lambda-package/backend/shared
rsync -a backend/shared/ /tmp/sotf-lambda-package/backend/shared/
touch /tmp/sotf-lambda-package/backend/__init__.py
touch /tmp/sotf-lambda-package/backend/shared/__init__.py

(cd /tmp/sotf-lambda-package && zip -qr "${OUT_ZIP}" .)
echo "${OUT_ZIP}"
