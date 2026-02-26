# SOCA Gate v1.1.1

## Observations

- Gate run timestamp: 2026-02-26T22:52:03Z
- RSI derives from mandatory checks/tests in this script.
- ZHV derives from required artifact presence.
- ZHDEEV derives from drift posture checks.

## Chosen Actions

- Executed drift check, build, and targeted e2e matrix checks.
- Probed bridge endpoints (local + optional tailscale target).
- Captured release diff and pack hash artifacts.

## Commands Used

- See [commands.log](/Users/arnaudassoumani/SOCA/core/tools/openbrowser/reports/v1.1.1/commands.log)

## Metrics

- RSI: 100
- ZHV: 100
- ZHDEEV: 100
- TRUST SCORE: 100

## Rollback Steps

1. Reload immutable pack `v1.1.0` from `chromium-extension-versions/CATALOG.json`.
2. Revert only `v1.1.1` commits on branch `codex/openbrowser-v1.1.1-soca-bridge-hardening`.
3. Re-run this gate script to confirm restored posture.

## Artifact Checklist

- [x] /Users/arnaudassoumani/SOCA/core/tools/openbrowser/reports/v1.1.1/provider-matrix.log
- [x] /Users/arnaudassoumani/SOCA/core/tools/openbrowser/reports/v1.1.1/no-egress.log
- [x] /Users/arnaudassoumani/SOCA/core/tools/openbrowser/reports/v1.1.1/bridge-probes.log
- [x] /Users/arnaudassoumani/SOCA/core/tools/openbrowser/reports/v1.1.1/release-diff.txt
- [x] /Users/arnaudassoumani/SOCA/core/tools/openbrowser/reports/v1.1.1/pack-hashes.txt
- [x] /Users/arnaudassoumani/SOCA/core/tools/openbrowser/reports/v1.1.1/screenshots/settings-provider-models.png
