# Prompt Buddy Bridge (SSOT)

Bridge is the single source of truth for Prompt Buddy policy, enhancement logic, and evidence.

## Endpoints

- `POST /soca/promptbuddy/enhance`
- `GET /soca/promptbuddy/profiles`
- `GET /soca/promptbuddy/health`
- `GET /soca/promptbuddy/capabilities`
- `GET /soca/promptbuddy/selftest`

## SSOT Assets

- Profiles: `core/promptbuddy/profiles/*.json`
- Evidence bundles: `runs/YYYY/MM/DD/promptbuddy/<enhancement_id>/`

## Adapters

- OpenBrowser extension background message handlers
- CLI wrapper: `core/bin/soco-promptbuddy`
- MCP server: `core/tools/promptbuddy_mcp/server.py`
