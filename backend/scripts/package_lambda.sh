#!/usr/bin/env bash
set -euo pipefail

LAMBDA_DIR="$1"
OUT_ZIP="$2"
PYTHON_VERSION="${3:-3.10}"
REQUIREMENTS_FILE="${LAMBDA_DIR}/requirements.txt"
PACKAGE_DIR="$(mktemp -d /tmp/sotf-lambda-package.XXXXXX)"

rm -f "${OUT_ZIP}"
cleanup() {
  rm -rf "${PACKAGE_DIR}"
}
trap cleanup EXIT

if [[ -f "${REQUIREMENTS_FILE}" && "${LAMBDA_VENDOR_DEPS:-true}" != "false" ]]; then
  python3 -m pip install \
    --requirement "${REQUIREMENTS_FILE}" \
    --target "${PACKAGE_DIR}" \
    --platform manylinux2014_x86_64 \
    --implementation cp \
    --python-version "${PYTHON_VERSION}" \
    --only-binary=:all: \
    --upgrade \
    --no-compile \
    --quiet
fi

rsync -a \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '*.pyo' \
  --exclude 'requirements.txt' \
  "${LAMBDA_DIR}/" "${PACKAGE_DIR}/"
mkdir -p "${PACKAGE_DIR}/backend/shared"
rsync -a \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '*.pyo' \
  backend/shared/ "${PACKAGE_DIR}/backend/shared/"
touch "${PACKAGE_DIR}/backend/__init__.py"
touch "${PACKAGE_DIR}/backend/shared/__init__.py"

(cd "${PACKAGE_DIR}" && zip -qr "${OUT_ZIP}" .)
echo "${OUT_ZIP}"
