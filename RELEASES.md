# OpenBrowser SOCA HOLOBIONT OS - Releases

## v1.1.1 (2026-02-26)

- Unified endpoint policy for bridge/direct URL validation and Tailscale-first candidate discovery.
- Provider routing corrected: `soca-bridge` + `vps-holo` remain bridge-routed; OpenRouter runs direct with API key.
- Local/cloud model partitioning enforced with `catalogMode` and `modelOrigin`.
- Chat composer simplified to lean default with advanced drawer.
- Added SOCA release gate script and evidence report outputs under `reports/v1.1.1/`.
- Release target bumped to `1.1.1` in manifest/package and prepared immutable pack flow.

## v1.1.0 (2026-02-26)

- Tailscale VPN support: bridge URLs via `*.ts.net` and CGNAT `100.64-127.x` now recognized as trusted
- New "VPS HOLO (Tailscale Bridge)" provider for remote SOCA Bridge access
- Updated model catalogs: OpenAI (GPT-4.1, o3, o4-mini), Anthropic (Claude Opus 4, Sonnet 4, 3.7 Sonnet), Google (Gemini 2.0 Flash), OpenRouter (expanded statics)
- Security: removed `<all_urls>` from host_permissions, replaced with scoped private IP + Tailscale patterns
- Drift checks (`check:drift`) now pass cleanly
- Consolidated URL validation to shared `isTrustedBridgeURL` across llm.ts and options

## v1.0.9 (2026-02-26)

- SOCA Bridge provider with live model catalog
- Provider policy mode (local-only vs cloud providers)
- Bridge status check + model catalog refresh
- Google OAuth support for Gemini
- Session-only secret storage (never persisted)
- SOCAkit 15-step sidebar panel
- Quick Actions (AA Triage, Second Brain, SOCA Pulse, NT2L Plan)

## v1.0.8 (2026-02-26)

- Bridge auto-fallback to Ollama
- OpenRouter bridge routing
- DNR guardrails

## v1.0.7 (2026-02-11)

- Provider secrets session-only storage
- Custom model name support

## v1.0.6 (2026-02-07)

- Dark mode / light mode theme support
- Improved sidebar error boundary

## v1.0.5 (2026-01-30)

- Initial SOCA Bridge integration
- Ollama local provider

## v1.0.4 (2026-01-25)

- Base OpenBrowser extension with sidebar chat
