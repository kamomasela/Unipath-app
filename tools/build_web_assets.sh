#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WWW_DIR="${ROOT_DIR}/www"
BUILD_VERSION="$(date +%Y%m%d%H%M%S)"

rm -rf "${WWW_DIR}"
mkdir -p "${WWW_DIR}/data" "${WWW_DIR}/sources"

cp "${ROOT_DIR}/index.html" "${WWW_DIR}/index.html"
cp "${ROOT_DIR}/review.html" "${WWW_DIR}/review.html"
cp "${ROOT_DIR}/about.html" "${WWW_DIR}/about.html"
cp "${ROOT_DIR}/styles.css" "${WWW_DIR}/styles.css"
cp "${ROOT_DIR}/app.js" "${WWW_DIR}/app.js"
cp "${ROOT_DIR}/review.js" "${WWW_DIR}/review.js"
cp "${ROOT_DIR}/sw.js" "${WWW_DIR}/sw.js"
cp "${ROOT_DIR}/manifest.webmanifest" "${WWW_DIR}/manifest.webmanifest"
cp "${ROOT_DIR}/IMG_1597.JPG" "${WWW_DIR}/IMG_1597.JPG"

cp "${ROOT_DIR}/data/approved_rules.json" "${WWW_DIR}/data/approved_rules.json"
cp "${ROOT_DIR}/data/approval_decisions.json" "${WWW_DIR}/data/approval_decisions.json"

# Cache-busting token replacement (cross-platform: macOS and Linux)
SED_INPLACE=(-i '')
if [[ "$(uname -s)" != "Darwin" ]]; then
  SED_INPLACE=(-i)
fi
find "${WWW_DIR}" -type f \( -name "*.html" -o -name "*.js" \) -print0 | \
  xargs -0 sed "${SED_INPLACE[@]}" "s/__BUILD_VERSION__/${BUILD_VERSION}/g"

echo "${BUILD_VERSION}" > "${WWW_DIR}/build-version.txt"

echo "Built web assets into ${WWW_DIR} (version ${BUILD_VERSION})"
