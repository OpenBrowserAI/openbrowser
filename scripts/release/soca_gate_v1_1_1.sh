#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="${ROOT_DIR}/reports/v1.1.1"
LOG_DIR="${REPORT_DIR}/logs"
SCREENSHOT_DIR="${REPORT_DIR}/screenshots"
SCREENSHOT_FILE="${SCREENSHOT_DIR}/settings-provider-models.png"

mkdir -p "${LOG_DIR}" "${SCREENSHOT_DIR}"

COMMAND_LOG="${REPORT_DIR}/commands.log"
PROVIDER_MATRIX_LOG="${REPORT_DIR}/provider-matrix.log"
NO_EGRESS_LOG="${REPORT_DIR}/no-egress.log"
BRIDGE_PROBE_LOG="${REPORT_DIR}/bridge-probes.log"
BUILD_LOG="${REPORT_DIR}/build.log"
DRIFT_LOG="${REPORT_DIR}/drift.log"
DIFF_LOG="${REPORT_DIR}/release-diff.txt"
HASH_LOG="${REPORT_DIR}/pack-hashes.txt"
JSON_REPORT="${REPORT_DIR}/soca-gate.json"
MD_REPORT="${REPORT_DIR}/soca-gate.md"

: >"${COMMAND_LOG}"

action() {
  local label="$1"
  shift
  local logfile="$1"
  shift
  {
    printf '\n[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "${label}"
    printf 'CMD: %s\n' "$*"
  } >>"${COMMAND_LOG}"

  if (cd "${ROOT_DIR}" && "$@") >"${logfile}" 2>&1; then
    echo "PASS" >>"${COMMAND_LOG}"
    return 0
  else
    local rc=$?
    echo "FAIL(rc=${rc})" >>"${COMMAND_LOG}"
    return ${rc}
  fi
}

PROBE_TARGETS=("http://127.0.0.1:9834")
if [[ -n "${SOCA_TAILSCALE_BRIDGE_URL:-}" ]]; then
  PROBE_TARGETS+=("${SOCA_TAILSCALE_BRIDGE_URL}")
fi

probe_bridge() {
  : >"${BRIDGE_PROBE_LOG}"
  local token="${SOCA_BRIDGE_TOKEN:-soca}"
  for target in "${PROBE_TARGETS[@]}"; do
    local root="${target%/}"
    {
      echo "=== ${root} ==="
      echo "-- /health"
      curl -sS -m 6 "${root}/health" || true
      echo
      echo "-- /soca/bridge/status"
      curl -sS -m 8 -H "Authorization: Bearer ${token}" "${root}/soca/bridge/status" || true
      echo
      echo "-- /v1/models"
      curl -sS -m 8 -H "Authorization: Bearer ${token}" "${root}/v1/models" || true
      echo
    } >>"${BRIDGE_PROBE_LOG}"
  done
}

run_total=0
run_passed=0

run_and_score() {
  local label="$1"
  local logfile="$2"
  shift 2
  run_total=$((run_total + 1))
  if action "${label}" "${logfile}" "$@"; then
    run_passed=$((run_passed + 1))
  fi
}

run_and_score "drift-check" "${DRIFT_LOG}" pnpm -C chromium-extension check:drift
run_and_score "build" "${BUILD_LOG}" pnpm -C chromium-extension build
run_and_score \
  "e2e-provider-matrix" \
  "${PROVIDER_MATRIX_LOG}" \
  env "SOCA_EVIDENCE_SCREENSHOT_PATH=${SCREENSHOT_FILE}" \
  pnpm -C chromium-extension test:e2e --grep "Provider model refresh matrix covers bridge/api-key/oauth modes"
run_and_score \
  "e2e-no-egress" \
  "${NO_EGRESS_LOG}" \
  pnpm -C chromium-extension test:e2e --grep "SW cannot fetch public internet"

probe_bridge

(
  cd "${ROOT_DIR}"
  git diff --stat >"${DIFF_LOG}" || true
  find chromium-extension-versions/v1.1.1 -type f -print0 2>/dev/null | \
    xargs -0 shasum -a 256 >"${HASH_LOG}" || true
)

rsi=0
if [[ "${run_total}" -gt 0 ]]; then
  rsi=$((100 * run_passed / run_total))
fi

zhdeev=0
if grep -q "OK: host_permissions has no <all_urls>." "${DRIFT_LOG}" 2>/dev/null; then
  zhdeev=100
fi

required_artifacts=(
  "${PROVIDER_MATRIX_LOG}"
  "${NO_EGRESS_LOG}"
  "${BRIDGE_PROBE_LOG}"
  "${DIFF_LOG}"
  "${HASH_LOG}"
  "${SCREENSHOT_FILE}"
)

artifact_total=${#required_artifacts[@]}
artifact_present=0
for artifact in "${required_artifacts[@]}"; do
  if [[ -s "${artifact}" ]]; then
    artifact_present=$((artifact_present + 1))
  fi
done

zhv=0
if [[ "${artifact_total}" -gt 0 ]]; then
  zhv=$((100 * artifact_present / artifact_total))
fi

trust_score=${rsi}
if [[ "${zhv}" -lt "${trust_score}" ]]; then
  trust_score=${zhv}
fi
if [[ "${zhdeev}" -lt "${trust_score}" ]]; then
  trust_score=${zhdeev}
fi

cat >"${JSON_REPORT}" <<JSON
{
  "version": "1.1.1",
  "generated_at_utc": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "metrics": {
    "RSI": ${rsi},
    "ZHV": ${zhv},
    "ZHDEEV": ${zhdeev},
    "TRUST_SCORE": ${trust_score}
  },
  "runs": {
    "total": ${run_total},
    "passed": ${run_passed}
  },
  "artifacts": {
    "total": ${artifact_total},
    "present": ${artifact_present}
  }
}
JSON

cat >"${MD_REPORT}" <<MD
# SOCA Gate v1.1.1

## Observations
- Gate run timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
- RSI derives from mandatory checks/tests in this script.
- ZHV derives from required artifact presence.
- ZHDEEV derives from drift posture checks.

## Chosen Actions
- Executed drift check, build, and targeted e2e matrix checks.
- Probed bridge endpoints (local + optional tailscale target).
- Captured release diff and pack hash artifacts.

## Commands Used
- See [commands.log](${COMMAND_LOG})

## Metrics
- RSI: ${rsi}
- ZHV: ${zhv}
- ZHDEEV: ${zhdeev}
- TRUST SCORE: ${trust_score}

## Rollback Steps
1. Reload immutable pack \`v1.1.0\` from \`chromium-extension-versions/CATALOG.json\`.
2. Revert only \`v1.1.1\` commits on branch \`codex/openbrowser-v1.1.1-soca-bridge-hardening\`.
3. Re-run this gate script to confirm restored posture.

## Artifact Checklist
$(for artifact in "${required_artifacts[@]}"; do
  if [[ -s "${artifact}" ]]; then
    echo "- [x] ${artifact}"
  else
    echo "- [ ] ${artifact}"
  fi
done)
MD

echo "SOCA gate report generated: ${MD_REPORT}"
