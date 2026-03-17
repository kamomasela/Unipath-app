#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WWW_DIR="${ROOT_DIR}/www"
DIST_DIR="${ROOT_DIR}/dist"
OUT_DIR="${DIST_DIR}/unipath-pwa"
OUT_ZIP="${DIST_DIR}/unipath-pwa.zip"

if [[ ! -d "${WWW_DIR}" ]]; then
  echo "Missing www directory. Run: npm run build:web"
  exit 1
fi

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"
cp -R "${WWW_DIR}/." "${OUT_DIR}/"

rm -f "${OUT_ZIP}"
(
  cd "${OUT_DIR}"
  zip -r "${OUT_ZIP}" . >/dev/null
)

echo "Created:"
echo "  ${OUT_DIR}"
echo "  ${OUT_ZIP}"
