#!/usr/bin/env bash
set -euo pipefail

manifest="public/manifest.json"

python3 - "$manifest" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

hosts = data.get("host_permissions") or []
if "<all_urls>" in hosts:
    print(f"FAIL: <all_urls> present in host_permissions in {path}")
    sys.exit(1)

print("OK: host_permissions has no <all_urls>.")
PY
