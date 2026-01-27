---
id: {{uuid}}
created_utc: {{created_utc}}
updated_utc: {{updated_utc}}
scope: SOCA
source: human
decision_type: openbrowser
status: {{status}}
links: []
evidence: []
---

# Decision: {{title}}

**Date**: {{date}}
**Status**: {{status}}
**Category**: OpenBrowser Automation

## Context

{{context}}

## Problem Statement

{{problem}}

## Options Considered

{{#options}}
### Option {{number}}: {{name}}

**Description**: {{description}}

**Pros**:
{{#pros}}
- {{.}}
{{/pros}}

**Cons**:
{{#cons}}
- {{.}}
{{/cons}}

{{/options}}

## Decision

**Chosen Option**: {{chosen_option}}

**Rationale**:
{{rationale}}

## Consequences

### Positive
{{#positive_consequences}}
- {{.}}
{{/positive_consequences}}

### Negative
{{#negative_consequences}}
- {{.}}
{{/negative_consequences}}

## Implementation Notes

{{implementation_notes}}

## Related Workflows

{{#related_workflows}}
- [[{{workflow_name}}]]
{{/related_workflows}}

## Evidence

{{#evidence}}
- `{{path}}` (sha256: `{{sha256}}`)
{{/evidence}}

---

[SOCA-STAMP]
type: vault-note
template: decision_openbrowser
decision_id: {{uuid}}
