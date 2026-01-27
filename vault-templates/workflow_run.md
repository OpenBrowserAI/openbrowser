---
id: {{uuid}}
created_utc: {{created_utc}}
updated_utc: {{updated_utc}}
scope: SOCA
source: soca-run
workflow: {{workflow_name}}
lane: {{lane}}
status: {{status}}
links:
  - {{evidence_dir}}
evidence:
  - path: {{evidence_dir}}/sha256.txt
    sha256: {{sha256_of_sha256txt}}
---

# Workflow Run: {{workflow_name}}

**Status**: {{status}}
**Lane**: {{lane}}
**Started**: {{started_utc}}
**Completed**: {{completed_utc}}

## Summary

{{summary}}

## Tasks Executed

| Task ID | Name | Status | HIL |
|---------|------|--------|-----|
{{#tasks}}
| {{id}} | {{name}} | {{status}} | {{hil_required}} |
{{/tasks}}

## Evidence Bundle

**Location**: `{{evidence_dir}}`

| Artifact | SHA256 |
|----------|--------|
{{#artifacts}}
| {{name}} | `{{sha256}}` |
{{/artifacts}}

## OpenBrowser Observations

{{#observations}}
### {{name}}
- **URL**: {{url}}
- **Action**: {{action}}
- **Result**: {{result}}
- **Screenshot**: {{screenshot_path}}
{{/observations}}

## HIL Decisions

{{#hil_decisions}}
- **Task**: {{task_id}}
- **Decision**: {{decision}}
- **Timestamp**: {{timestamp}}
- **Notes**: {{notes}}
{{/hil_decisions}}

## Notes

{{notes}}

---

[SOCA-STAMP]
type: vault-note
template: workflow_run
workflow: {{workflow_name}}
evidence_dir: {{evidence_dir}}
