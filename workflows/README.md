# OpenBrowser Workflows (SOCA HOLOBIONT OS)

Fail-closed, auditable task workflows for OpenCode + OpenBrowser automation.

## Architecture

```
OpenCode executes (bash/edit tools) -> OpenBrowser verifies (screenshots/snapshots)
```

OpenBrowser provides browser tools (open tab/screenshot/snapshot) but does not replace shell execution.
Terminal actions happen via OpenCode tools, and OpenBrowser is used for UI observation and verification.

## Directory Structure

```
workflows/
  templates/         # Reusable YAML task templates
    vps-capsule.yaml       # VPS secure capsule setup
    clawdbot-deploy.yaml   # Clawdbot + Tailscale deployment
    preflight.yaml         # Universal preflight inventory
    evidence-bundle.yaml   # Evidence collection workflow
    aa-email-triage.yaml   # AA daily email triage (manual paste)
    aa-second-brain.yaml   # AA Second Brain capture
    soca-pulse-daily.yaml  # SOCA Pulse daily prompt flow
  examples/          # Example workflow compositions
  prompts/           # Agent prompts for workflow execution
```

## Workflow Contract

Every workflow YAML follows the SOCA fail-closed pattern:
1. **PLAN** - Show command list
2. **APPROVE** - Wait for HIL approval
3. **EXECUTE** - Run commands one at a time
4. **VERIFY** - Check outputs and state
5. **EVIDENCE** - Write evidence bundle with sha256

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `OPENCODE_BROWSER_BACKEND` | Browser automation mode | `agent` |
| `SOCA_OPENBROWSER_BRIDGE_TOKEN` | Bridge auth token | `soca` |
| `SOCA_OPENBROWSER_BRIDGE_PORT` | Bridge server port | `9834` |

## Usage

### Via OpenCode

Paste workflow into OpenCode chat:

```
Execute workflow from tools/openbrowser/workflows/templates/vps-capsule.yaml
For each task: (1) show plan, (2) wait for approval, (3) execute, (4) verify
Never read ~/.soca-secrets or print tokens.
```

### Via SOCA Bridge

```bash
curl -X POST http://127.0.0.1:9834/soca/workflow/execute \
  -H "Authorization: Bearer soca" \
  -H "Content-Type: application/json" \
  -d '{"workflow": "vps-capsule", "dry_run": true}'
```

## Related

- Constitution Rule 61 (SOCA Bridge)
- Constitution Rule 66 (OpenBrowser Automation)
- `tools/openbrowser/bridge/app.py`
- `.claude/commands/soca-bridge.md`

---
[SOCA-STAMP]
type: documentation
version: 1.0.0
related:
  - core/SOCAcore/CONSTITUTION.md
  - tools/openbrowser/bridge/app.py
