#!/bin/bash

# OpenBrowser Patch Application Script
# This script applies all OpenBrowser patches to the Chromium source tree
# in the correct dependency order.

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENBROWSER_ROOT="$(dirname "$SCRIPT_DIR")"
CHROMIUM_SRC="${CHROMIUM_SRC:-$OPENBROWSER_ROOT/../chromium/src}"

PATCHES_DIR="$OPENBROWSER_ROOT/chromium/patches"

echo "========================================="
echo "Applying OpenBrowser Patches"
echo "========================================="
echo "Patches source: $PATCHES_DIR"
echo "Chromium source: $CHROMIUM_SRC"
echo ""

if [ ! -d "$CHROMIUM_SRC" ]; then
    echo "ERROR: Chromium source directory not found at $CHROMIUM_SRC"
    echo "Set CHROMIUM_SRC environment variable or run from correct location"
    exit 1
fi

if [ ! -d "$PATCHES_DIR" ]; then
    echo "ERROR: Patches directory not found at $PATCHES_DIR"
    exit 1
fi

cd "$CHROMIUM_SRC"

# Function to apply a single patch
apply_patch() {
    local patch_file="$1"
    local patch_name="$(basename "$patch_file")"

    echo "----------------------------------------"
    echo "Applying: $patch_name"
    echo "----------------------------------------"

    if git apply --check "$patch_file" 2>&1; then
        git apply "$patch_file"
        echo "✅ Successfully applied: $patch_name"
        echo ""
        return 0
    else
        echo "❌ FAILED to apply: $patch_name"
        echo ""
        echo "Run the following to see details:"
        echo "  cd $CHROMIUM_SRC"
        echo "  git apply --check $patch_file"
        echo ""
        return 1
    fi
}

# Apply patches in dependency order
# Patch 1: Branding (MUST BE FIRST - has overlaps)
echo "Step 1/4: Applying branding patch..."
if [ -f "$PATCHES_DIR/branding/branding_and_theme.patch" ]; then
    apply_patch "$PATCHES_DIR/branding/branding_and_theme.patch" || exit 1
else
    echo "⚠️  WARNING: branding_and_theme.patch not found, skipping"
fi

# Patch 2: UI Theme Changes (after branding)
echo "Step 2/4: Applying UI theme patch..."
if [ -f "$PATCHES_DIR/ui/theme_and_ui_changes.patch" ]; then
    apply_patch "$PATCHES_DIR/ui/theme_and_ui_changes.patch" || exit 1
else
    echo "⚠️  WARNING: theme_and_ui_changes.patch not found, skipping"
fi

# Patch 3: Settings UI (after branding)
echo "Step 3/4: Applying settings UI patch..."
if [ -f "$PATCHES_DIR/settings_ui_changes.patch" ]; then
    apply_patch "$PATCHES_DIR/settings_ui_changes.patch" || exit 1
else
    echo "⚠️  WARNING: settings_ui_changes.patch not found, skipping"
fi

# Patch 4: URL Branding (independent - can be applied anytime)
echo "Step 4/4: Applying URL branding patch..."
if [ -f "$PATCHES_DIR/branding_url_changes.patch" ]; then
    apply_patch "$PATCHES_DIR/branding_url_changes.patch" || exit 1
else
    echo "⚠️  WARNING: branding_url_changes.patch not found, skipping"
fi

echo "========================================="
echo "✅ All patches applied successfully!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Run apply_branding_assets.sh to copy binary assets"
echo "  2. Build Chromium with autoninja -C out/Default chrome"
echo ""
