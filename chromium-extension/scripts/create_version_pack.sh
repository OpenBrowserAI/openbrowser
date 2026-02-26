#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/create_version_pack.sh <version>

Example:
  scripts/create_version_pack.sh 1.0.5
  scripts/create_version_pack.sh v1.0.5

Behavior:
  - Copies chromium-extension/dist into chromium-extension-versions/v<version>
  - Rewrites manifest.json version to <version>
  - Fails if target folder already exists (immutable version packs)
EOF
}

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 2
fi

raw_version="$1"
version="${raw_version#v}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must match semver X.Y.Z (got: ${raw_version})" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${EXT_ROOT}/dist"
VERSIONS_ROOT="${EXT_ROOT}-versions"
DEST_DIR="${VERSIONS_ROOT}/v${version}"

if [[ ! -d "${DIST_DIR}" ]]; then
  echo "Error: dist folder not found: ${DIST_DIR}" >&2
  echo "Run: pnpm -C ${EXT_ROOT} build" >&2
  exit 1
fi

if [[ -e "${DEST_DIR}" ]]; then
  echo "Error: version pack already exists (immutable): ${DEST_DIR}" >&2
  exit 1
fi

mkdir -p "${VERSIONS_ROOT}" "${DEST_DIR}"
cp -a "${DIST_DIR}/." "${DEST_DIR}/"

manifest_path="${DEST_DIR}/manifest.json"
if [[ ! -f "${manifest_path}" ]]; then
  echo "Error: missing manifest in dist copy: ${manifest_path}" >&2
  exit 1
fi

MANIFEST_PATH="${manifest_path}" TARGET_VERSION="${version}" python3 - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ["MANIFEST_PATH"])
target = os.environ["TARGET_VERSION"]
data = json.loads(path.read_text(encoding="utf-8"))
data["version"] = target
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(path)
PY

commit="$(git -C "${EXT_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
cat > "${DEST_DIR}/PACK_INFO.md" <<EOF
# OpenBrowser Pack v${version}

- Generated UTC: ${ts}
- Source commit: ${commit}
- Source: \`core/tools/openbrowser/chromium-extension/dist\`
- Load in Chromium: \`chrome://extensions\` -> Developer mode -> Load unpacked -> \`${DEST_DIR}\`
EOF

echo "Created immutable version pack: ${DEST_DIR}"
