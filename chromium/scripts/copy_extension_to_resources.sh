#!/bin/bash

# OpenBrowser Extension Copy Script
# This script copies the built chromium extension (dist folder) to the
# Chromium resources directory where it can be loaded as a built-in extension.

set -e  # Exit on error

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OB_CHROMIUM_DIR="$(dirname "$SCRIPTS_DIR")"
OB_ROOT="$(dirname "$OB_CHROMIUM_DIR")"
CHROMIUM_SOURCE_DIR="${CHROMIUM_SRC:-$OB_ROOT/../chromium/src}"

EXTENSION_DIST_DIR="$OB_ROOT/chromium-extension/dist"
EXTENSION_RESOURCES_DIR="$CHROMIUM_SOURCE_DIR/chrome/browser/resources/openbrowser_assistant"

echo "========================================="
echo "Copying OpenBrowser Extension to Resources"
echo "========================================="
echo "Extension source: $EXTENSION_DIST_DIR"
echo "Resources destination: $EXTENSION_RESOURCES_DIR"
echo ""

if [ ! -d "$CHROMIUM_SOURCE_DIR" ]; then
    echo "ERROR: Chromium source directory not found at $CHROMIUM_SOURCE_DIR"
    echo "Set CHROMIUM_SRC environment variable or run from correct location"
    exit 1
fi

if [ ! -d "$EXTENSION_DIST_DIR" ]; then
    echo "ERROR: Extension dist directory not found at $EXTENSION_DIST_DIR"
    echo "Make sure to build the extension first (e.g., pnpm build)"
    exit 1
fi

# Remove existing resources if present
if [ -d "$EXTENSION_RESOURCES_DIR" ]; then
    echo "🗑️  Removing existing resources at $EXTENSION_RESOURCES_DIR"
    rm -rf "$EXTENSION_RESOURCES_DIR"
fi

# Create destination directory
echo "📁 Creating destination directory..."
mkdir -p "$EXTENSION_RESOURCES_DIR"

# Copy all files from dist to resources
echo "📋 Copying extension files..."
cp -r "$EXTENSION_DIST_DIR"/* "$EXTENSION_RESOURCES_DIR/"

# Verify the copy
if [ -f "$EXTENSION_RESOURCES_DIR/manifest.json" ]; then
    echo "✅ manifest.json found"
else
    echo "⚠️  WARNING: manifest.json not found in destination"
    exit 1
fi

# Add the key to manifest.json
echo "🔑 Adding extension key to manifest.json..."
MANIFEST_PATH="$EXTENSION_RESOURCES_DIR/manifest.json"
EXTENSION_KEY="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnk6aCCanZ8kXgeZ9DjCSi8m2IhWn+CVGfw9Rm/kGdjGnJrdCCsNi7CwNPqwkC6vW+yRGc1NrBzTTeLzToIeH6p+scCp0zg5iTiOL+xBq1KtyyMGdtH6tb1GvXGud3RwD/GGkmhFsWlRtxzVzyz7NtDBhXlDDDLw/OgDi/DQGYsBfClSSvL1gNToeML+sWiRhBDhUJ+GIRRpOvDCBCXOQXTTwDWiEPFcsmfU2H/nRlWZtfqz8mMPU5ISDTR68dnLc4JhxsegrcQcV9nVxZlUjKXsdR/gdFf3DWCrJQkYwspYyg8MEzqxtRaC/G9RCP88jaBGjf9RFzkB497CpgN5+ywIDAQAB"

# Use Python to add the key to the manifest.json
python3 -c "
import json
import sys

try:
    with open('$MANIFEST_PATH', 'r') as f:
        manifest = json.load(f)

    manifest['key'] = '$EXTENSION_KEY'

    with open('$MANIFEST_PATH', 'w') as f:
        json.dump(manifest, f, indent=2)

    print('✅ Extension key added to manifest.json')
except Exception as e:
    print(f'❌ ERROR: Failed to add key to manifest.json: {e}', file=sys.stderr)
    sys.exit(1)
"

if [ $? -ne 0 ]; then
    echo "⚠️  WARNING: Failed to add key to manifest.json"
    exit 1
fi

echo ""
echo "========================================="
echo "✅ Extension copied successfully!"
echo "========================================="
echo ""
echo "Files copied to: $EXTENSION_RESOURCES_DIR"
echo ""
echo "Next steps:"
echo "  1. Rebuild Chromium to include the updated extension"
echo "  2. The extension will be available as a built-in resource"
