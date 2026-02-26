#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# This script lives inside a nested OpenBrowser git repo at:
#   <SOCA_ROOT>/core/tools/openbrowser/chromium-extension/scripts/l3_run_all.sh
# We want the SOCA repo root (not the nested OpenBrowser root), because our paths
# in this runbook are repo-root anchored.
OPENBROWSER_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$OPENBROWSER_ROOT/../../.." && pwd)"
if [[ ! -d "${REPO_ROOT}/core/tools/openbrowser" ]]; then
  echo "ERROR: unable to resolve SOCA repo root from ${SCRIPT_DIR}" >&2
  exit 1
fi

cd "$REPO_ROOT"

echo "[gate0] preflight: versions"
node -v
pnpm -v
python3 --version

echo ""
echo "[gate1] build chain (core -> extension -> chromium-extension)"
pnpm -C core/tools/openbrowser/packages/core build
pnpm -C core/tools/openbrowser/packages/extension build
pnpm -C core/tools/openbrowser/chromium-extension build

echo ""
echo "[gate2] drift gates (mechanical no-egress invariants)"
pnpm -C core/tools/openbrowser/chromium-extension check:drift

echo ""
echo "[gate3] bridge sanity (syntax + SSOT endpoints)"
python3 -m py_compile core/tools/openbrowser/bridge/app.py

BRIDGE_HOST="${SOCA_OPENBROWSER_BRIDGE_HOST:-127.0.0.1}"
BRIDGE_PORT="${SOCA_OPENBROWSER_BRIDGE_PORT:-9834}"
BRIDGE_BASE="http://${BRIDGE_HOST}:${BRIDGE_PORT}"

BRIDGE_PID=""
BRIDGE_LOG=""
cleanup_bridge() {
  if [[ -n "${BRIDGE_PID:-}" ]]; then
    kill "${BRIDGE_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${BRIDGE_LOG:-}" ]]; then
    echo ""
    echo "[gate3] bridge logs: ${BRIDGE_LOG}"
  fi
}
trap cleanup_bridge EXIT INT TERM

if ! curl -sS --max-time 2 "${BRIDGE_BASE}/health" >/dev/null 2>&1; then
  echo "[gate3] bridge not detected at ${BRIDGE_BASE} (starting ephemeral bridge for sanity checks)"
  # macOS mktemp requires the template to end with X's (no suffix like ".log").
  tmpdir="${TMPDIR:-/tmp}"
  tmpdir="${tmpdir%/}"
  BRIDGE_LOG="$(mktemp "${tmpdir}/soca-openbrowser-bridge.l3.XXXXXX")"
  SOCA_OPENBROWSER_BRIDGE_HOST="${BRIDGE_HOST}" \
    SOCA_OPENBROWSER_BRIDGE_PORT="${BRIDGE_PORT}" \
    python3 core/tools/openbrowser/bridge/app.py >"${BRIDGE_LOG}" 2>&1 &
  BRIDGE_PID="$!"

  for _ in $(seq 1 50); do
    if curl -sS --max-time 2 "${BRIDGE_BASE}/health" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
fi

curl -s "${BRIDGE_BASE}/capabilities" | head
curl -s -H "Authorization: Bearer soca" "${BRIDGE_BASE}/soca/policy/packs" | head
curl -s -H "Authorization: Bearer soca" "${BRIDGE_BASE}/v1/models" | head

echo ""
echo "[gate4] e2e (headed, observable)"
pnpm -C core/tools/openbrowser/chromium-extension test:e2e --headed
