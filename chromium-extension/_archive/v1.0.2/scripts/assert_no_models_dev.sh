#!/usr/bin/env bash
set -euo pipefail

if rg -n "models\\.dev" src; then
  echo "FAIL: models.dev reference found in extension source (no direct egress)."
  exit 1
fi

echo "OK: no models.dev in extension source."
