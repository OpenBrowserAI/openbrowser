# SOCA HOLOBIONT OS Vault Templates for OpenBrowser

These templates are designed for the `SOCA_HOLOBIONT_OS` Obsidian vault.
They support OpenBrowser automation workflows with proper SOCA metadata.

## Vault Path

Templates are intended for: `vaults/SOCA_HOLOBIONT_OS/`

## Template Categories

| Template | Purpose | Folder |
|----------|---------|--------|
| `workflow_run.md` | Document a workflow execution | `30_RUNS/` |
| `decision_openbrowser.md` | Record OpenBrowser-related decisions | `20_DECISIONS/` |
| `artifact_index.md` | Index evidence artifacts | `40_ARTIFACTS_INDEX/` |
| `idea_automation.md` | Capture automation improvement ideas | `10_IDEAS/` |

## Required Frontmatter

All vault notes MUST include:

```yaml
---
id: <UUID>
created_utc: <ISO timestamp>
updated_utc: <ISO timestamp>
scope: SOCA
source: soca-run | human | import
links: []
evidence: []
---
```

## Integration with OpenBrowser Workflows

When a workflow completes:
1. Evidence bundle is written to `runs/_local/<workflow>/`
2. Vault note is created/updated with evidence pointers
3. Artifact index is updated with new evidence paths

## Related

- `tools/openbrowser/workflows/templates/`
- `core/SOCAcore/socakit.md` (5L Memory tiers)
- Constitution Rule 4 (Continuous Memory)
- Constitution Rule 66 (OpenBrowser Automation)

---
[SOCA-STAMP]
type: documentation
version: 1.0.0
scope: vault-templates
