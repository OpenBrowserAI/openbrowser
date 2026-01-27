---
id: {{uuid}}
created_utc: {{created_utc}}
updated_utc: {{updated_utc}}
scope: SOCA
source: soca-run
artifact_type: openbrowser-evidence
links: []
evidence: []
---

# Artifact Index: OpenBrowser Evidence

**Last Updated**: {{updated_utc}}
**Total Artifacts**: {{total_count}}

## Recent Evidence Bundles

| Date | Workflow | Lane | Evidence Dir | Manifest |
|------|----------|------|--------------|----------|
{{#bundles}}
| {{date}} | {{workflow}} | {{lane}} | `{{evidence_dir}}` | [[{{manifest_link}}]] |
{{/bundles}}

## Evidence by Workflow Type

### VPS Capsule Setup
{{#vps_capsule}}
- `{{evidence_dir}}` ({{date}})
{{/vps_capsule}}

### Clawdbot Deploy
{{#clawdbot_deploy}}
- `{{evidence_dir}}` ({{date}})
{{/clawdbot_deploy}}

### OpenBrowser Setup
{{#openbrowser_setup}}
- `{{evidence_dir}}` ({{date}})
{{/openbrowser_setup}}

### Preflight Inventory
{{#preflight}}
- `{{evidence_dir}}` ({{date}})
{{/preflight}}

## Screenshot Archive

| Timestamp | Workflow | URL | Screenshot |
|-----------|----------|-----|------------|
{{#screenshots}}
| {{timestamp}} | {{workflow}} | {{url}} | `{{path}}` |
{{/screenshots}}

## Hash Verification

To verify evidence integrity:

```bash
cd {{evidence_base_dir}}
for dir in */; do
  echo "Verifying $dir..."
  (cd "$dir" && sha256sum -c sha256.txt 2>/dev/null || shasum -a 256 -c sha256.txt)
done
```

## Notes

{{notes}}

---

[SOCA-STAMP]
type: vault-note
template: artifact_index
artifact_type: openbrowser-evidence
