# OpenBrowser Chromium Extension Version Packs

This folder stores immutable unpacked extension packs.
Each version is a separate folder so users can load the exact version they choose.

## Load a specific version

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select one of:
   - `core/tools/openbrowser/chromium-extension-versions/v1.0.4`
   - `core/tools/openbrowser/chromium-extension-versions/v1.0.5`
   - `core/tools/openbrowser/chromium-extension-versions/v1.0.6`
   - `core/tools/openbrowser/chromium-extension-versions/v1.0.7`

## Rules

- Never overwrite an existing version folder.
- Every new version must create a new `vX.Y.Z` folder.
- Previous versions remain available for rollback.

## Create a new pack

```bash
pnpm -C core/tools/openbrowser/chromium-extension build
core/tools/openbrowser/chromium-extension/scripts/create_version_pack.sh vX.Y.Z
```
