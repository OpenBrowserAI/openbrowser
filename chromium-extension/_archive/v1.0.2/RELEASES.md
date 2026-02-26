# OpenBrowser Chromium Extension Releases

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
