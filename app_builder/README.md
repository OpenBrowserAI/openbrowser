# SOCA OpenBrowser App Builder (v1)

This module implements a SOCA App Builder lane designed for **Best-of-N** candidate generation across multiple web builders (Google AI Studio Build, Lovable, Antigravity) with:

- Deterministic, replayable **Action DSL** runs
- **Evidence-first** artifacts (screenshots, DOM snapshots, actions log, downloads, sha256 manifest)
- **Fail-closed** behavior (missing artifacts = FAIL)
- **HIL-gated** steps (explicit pauses for login/OAuth/export/download when required)

Key files:

- Blueprint (SSOT input contract):
  - `SOCA_APP_BUILDER_BLUEPRINT.v1.json`
- Action specs (per builder):
  - `actions/google_ai_studio_build.actions.v1.json`
  - `actions/lovable.actions.v1.json`
  - `actions/antigravity.actions.v1.json`
- Runner (Action DSL engine + evidence):
  - `run_action_spec.ts`

Notes:

- The provided action specs are **templates** and may require selector tuning as vendor UIs evolve.
- This lane is designed to be extended with additional builders by adding new `actions/*.actions.v1.json` and adapter logic.
