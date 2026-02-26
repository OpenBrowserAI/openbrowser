# OpenBrowser Chromium Extension Releases

## [1.1.1] - 2026-02-26

### Added

- **Endpoint policy module**: Added `src/llm/endpointPolicy.ts` as single source of truth for URL normalization, host classification, bridge trust rules, direct URL policy, and bridge candidate ordering.
- **SOCA gate automation**: Added `scripts/release/soca_gate_v1_1_1.sh` to generate RSI/ZHV/ZHDEEV/TRUST reports in `reports/v1.1.1/`.
- **Lean composer components**: Added `ComposerCore`, `ComposerAdvanced`, `QuickActionsMenu`, and `SocaKitPanel` for modular sidebar composition.

### Changed

- **Provider routing split**: Bridge-routed providers are now strictly `soca-bridge` and `vps-holo`; OpenRouter is direct-cloud again.
- **Catalog partitioning**: Added provider `catalogMode` + model `modelOrigin` contract and filtering so local/bridge providers only expose local/VPS models while cloud providers expose cloud models.
- **Bridge health probing**: Bridge checks now probe ordered candidate URLs and return actionable status (reachable, token missing/rejected, host permission missing, unreachable).
- **Manifest tightening**: Removed broad private-IP wildcard host permissions from source manifest while retaining localhost and Tailscale support.
- **Chat UX simplification**: Default composer now focuses on input + send + core actions; advanced controls moved behind explicit expand.

### Archive

- Added immutable version pack: `core/tools/openbrowser/chromium-extension-versions/v1.1.1`.

## [1.1.0] - 2026-02-26

### Added

- **Bidirectional Coworking**: Implemented persistent WebSocket coworking connection in the extension to receive executable tasks from the SOCA Bridge.
- **Tailscale First-Class Support**: Added `<all_urls>` and `*://*.ts.net/*` to `manifest.json` `host_permissions` for seamless Tailscale bridge routing.

### Changed

- **Model Direct Providers**: Restored full model catalogs for direct execution on Anthropic, OpenAI, Google Gemini, and OpenRouter in `llm.ts`.
- **Custom Model Scope**: Clarified generic custom model to `SOCA Agent SDK (Custom)` to represent the HOLOBIONT OS model.
- **UI Theming**: Upgraded `HumanCard.tsx` backgrounds to use `bg-theme-input border-theme-input` for seamless dark/light mode transition matching SOCA design.

### Archive

- Added immutable version pack: `core/tools/openbrowser/chromium-extension-versions/v1.1.0`.

## [1.0.9] - 2026-02-26

### Fixed

- **Bridge token auto-populate**: Default token "soca" is now auto-set on fresh install, eliminating the `bridge_token_missing` error shown on first run without manual configuration.
- **MCP tools enabled by default**: All 5 MCP tools (webfetch, context7, github, nanobanapro, nt2l) now default to enabled on fresh install instead of disabled.
- **Provider policy UX**: Renamed confusing "Provider policy mode" to "Allow cloud providers" with clearer descriptions. Direct-provider-blocked warning now includes a one-click "Enable cloud providers now" button instead of just a static message.
- **Bridge error messages**: Improved `bridge_token_missing`, `bridge_timeout`, and `failed to fetch` user-facing error messages with actionable guidance including Tailscale hints.
- **Provider not allowed message**: Updated to reference the renamed "Allow cloud providers" toggle.

### Changed

- **Vision model heuristics**: Expanded `guessVisionSupport()` to recognize 15+ additional model families (o1/o3/o4, deepseek, phi-4/5, molmo, qwq, qwen2.5/qwen3, minicpm, internvl, cogvlm, moondream, bakllava, llama-3, mistral, nous-hermes, gemma, gpt-image).
- **Ollama live catalog**: Ollama provider now supports live model catalog refresh (`supportsLiveCatalog: true`) so locally-installed models appear without manual entry.
- **Bridge server binding**: Default bridge host changed from `127.0.0.1` to `0.0.0.0` for Tailscale/VPS HOLO reachability. Set `SOCA_OPENBROWSER_BRIDGE_HOST=127.0.0.1` to restrict to localhost.
- **Bridge health endpoint**: Now returns hostname, bind address, token_required, and ollama_configured fields for better diagnostics.
- **Bridge version**: Bumped to v1.1.0.

### Archive

- Added immutable version pack: `core/tools/openbrowser/chromium-extension-versions/v1.0.9`.
- Previous packs (`v1.0.4` to `v1.0.8`) remain untouched.

## [1.0.8] - 2026-02-26

### Added

- Provider/auth matrix expansion in Settings:
  - OpenRouter (bridge-routed), OpenAI, Anthropic, Gemini, and Opencode Zen choices.
  - Auth mode selector (`api_key` / `oauth`) with Google OAuth connect/disconnect/status controls.
  - Opencode Zen token-mode (`oauth`) support using session bearer token.
- Runtime provider model refresh contract:
  - `SOCA_PROVIDER_MODELS_REFRESH` with local TTL cache and manual refresh UI.
  - Provider smoke test coverage for bridge + direct + oauth/token modes (`e2e/provider-matrix.spec.ts`).

### Changed

- Provider registry now carries auth/model metadata (`authModes`, `modelSource`, `requiresBaseURL`, `supportsLiveCatalog`) and includes Opencode Zen preset.
- Secrets handling is session-only for providers (`socaProviderSecretsSession`) and Google OAuth (`socaGoogleOAuthSession`); non-secret config remains in `chrome.storage.local`.
- Error normalization upgraded for bridge token missing/rejected and provider forbidden states, with deterministic user-facing guidance.
- Manifest permission posture tightened:
  - Added `identity` for OAuth.
  - Removed broad optional wildcard host pattern.

### Fixed

- Eliminated recurrent `bridge_token_missing` / raw forbidden UX by adding preflight validation + explicit runtime error mapping.
- Model catalog fallbacks now stay usable with custom model entry when live refresh fails.

### Archive

- Added immutable version pack: `core/tools/openbrowser/chromium-extension-versions/v1.0.8`.
- Previous packs (`v1.0.4` to `v1.0.7`) remain untouched.

## [1.0.7] - 2026-02-24

### Fixed

- Sidebar no longer fails to an unusable blank state on runtime render errors:
  - Added `SidebarErrorBoundary` with reload + local-state reset actions.
  - Hardened keepalive connection startup (`chrome.runtime.connect`) with fail-safe handling.
- Improved visual recoverability on dark/light themes with stricter contrast fallback in theme parsing.

### Changed

- Removed `side_panel.openPanelOnActionClick` from `manifest.json` to avoid manifest-level DevTools warnings; runtime behavior remains enforced from background service worker.
- Added immutable version pack `v1.0.7` for direct rollback/user selection.

### Archive

- Previous packs (`v1.0.4`, `v1.0.5`, `v1.0.6`) remain untouched.

## [1.0.6] - 2026-02-24

### Added

- New immutable unpacked version folder: `core/tools/openbrowser/chromium-extension-versions/v1.0.6`.

### Changed

- Source extension metadata version bumped to `1.0.6` in manifest and package.
- Version catalog updated so users can choose `v1.0.4`, `v1.0.5`, or `v1.0.6` at load time.

### Archive

- Previous packs remain untouched for rollback and user selection.

## [1.0.4] - 2026-02-24

### Added

- Bridge status endpoint support in Settings (`/soca/bridge/status`) with model-count diagnostics.
- macOS `launchd` bridge service assets under `services/openbrowser-bridge/`.
- Full OpenRouter model catalog exposure in the model selector (bridge-routed, searchable).

### Changed

- Bridge `/v1/models` now returns merged metadata-rich catalog (SOCA aliases + Ollama + OpenRouter).
- OpenRouter model picker keeps `openrouter/auto` pinned at the top.
- Sidebar theming now enforces contrast-safe text color on light/white backgrounds while preserving theme variables.

### Fixed

- Reduced flaky “not connecting” behavior by prioritizing daemonized bridge startup in recovery flow.
- Improved lane/allowlist/policy error normalization in sidebar messages.

### Archive

- Snapshot of 1.0.3 preserved under `_archive/v1.0.3/`.

## [1.0.5] - 2026-02-24

### Added

- Immutable version-pack workflow script: `scripts/create_version_pack.sh`.
- Dedicated version-pack catalog root: `core/tools/openbrowser/chromium-extension-versions/`.
- Two loadable unpacked packs created side-by-side:
  - `v1.0.4`
  - `v1.0.5`

### Changed

- Release process now enforces “new folder per version” for user-selectable rollback.

### Archive

- Previous packs remain untouched; no overwrite policy enforced by script.

## [1.0.3] - 2026-02-23

### Added

- Bridge Status check in Settings (health + token validation).
- Local OpenAI-compatible presets (LM Studio, vLLM, LocalAI) for fast local setup.
- Host permission prompt for custom Base URL origins.

### Changed

- Direct provider catalog is visible in all lanes; execution remains gated by lane + toggle.
- OpenAI-compatible providers now treat private IPs as local by default.
- Optional host permissions allow custom provider domains (prompted on Save).

### Fixed

- Safer base URL parsing for custom providers.
- Improved Model Name label spacing for visibility.

### Archive

- Snapshot of 1.0.2 preserved under `_archive/v1.0.2/`.

## [1.0.2] - 2026-02-23

### Added

- SOCaKit 15-step protocol embedded into the assistant system prompt and visible UI panel.
- Direct provider catalog (OpenAI, Anthropic, Google, Azure, Bedrock, OpenRouter, OpenAI-compatible) with security gating and local-first defaults.
- Visible Send and New Conversation buttons for faster operation.

### Changed

- Sidebar theme backgrounds now follow Chrome theme variables for improved contrast.
- Quick Actions styling updated for better readability.
- Error messages now map common bridge issues to actionable guidance.

### Fixed

- Reduced ambiguity for bridge connection failures and missing token errors.

### Archive

- Snapshot of 1.0.1 preserved under `_archive/v1.0.1/`.

## [1.0.1] - 2026-02-22

### Added

- NT2L bridge tool suite (plan validation, dry-run execution, approvals preview, schedule, carnet handoff).
- AA triage, Second Brain, and SOCA Pulse quick prompts in the local Prompt Library.
- OpenBrowser workflow templates for AA triage, Second Brain capture, and SOCA Pulse daily flow.

### Changed

- UI guardrails for large error payloads (sanitized + truncated display).
- Background log summaries to avoid oversized extension error dumps.

### Fixed

- Prevented oversized error payloads from flooding the sidebar and extensions error logs.

### Archive

- Snapshot of 1.0.0 preserved under `_archive/v1.0.0/`.

## [1.0.0] - 2026-02-22

### Added

- Initial OpenBrowser Chromium extension scaffold.
