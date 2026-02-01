#!/bin/bash

# OpenBrowser Branding Assets Application Script
# This script copies branding assets (logos, icons) from the branding_assets/
# directory to the appropriate locations in the Chromium source tree.

set -e  # Exit on error

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OB_CHROMIUM_DIR="$(dirname "$SCRIPTS_DIR")"
OB_ROOT="$(dirname "$OB_CHROMIUM_DIR")"
CHROMIUM_SOURCE_DIR="${CHROMIUM_SRC:-$OB_ROOT/../chromium/src}"

BRANDING_ASSETS_DIR="$OB_ROOT/branding_assets"

echo "========================================="
echo "Applying OpenBrowser Branding Assets"
echo "========================================="
echo "Assets source: $BRANDING_ASSETS_DIR"
echo "Chromium source: $CHROMIUM_SOURCE_DIR"
echo ""

if [ ! -d "$CHROMIUM_SOURCE_DIR" ]; then
    echo "ERROR: Chromium source directory not found at $CHROMIUM_SOURCE_DIR"
    echo "Set CHROMIUM_SRC environment variable or run from correct location"
    exit 1
fi

if [ ! -d "$BRANDING_ASSETS_DIR" ]; then
    echo "ERROR: Branding assets directory not found at $BRANDING_ASSETS_DIR"
    exit 1
fi

# Function to copy asset with verification
copy_asset() {
    local src="$BRANDING_ASSETS_DIR/$1"
    local dest="$CHROMIUM_SOURCE_DIR/$2"

    if [ ! -f "$src" ]; then
        echo "⚠️  WARNING: Source file not found: $src"
        return 1
    fi

    local dest_dir="$(dirname "$dest")"
    mkdir -p "$dest_dir"

    cp "$src" "$dest"
    echo "✅ Copied: $1 → $2"
}

echo "Copying macOS app icons..."
copy_asset "icons/mac/app.icns" "chrome/app/theme/chromium/mac/app.icns"
copy_asset "icons/mac/app-temp.icns" "chrome/app/theme/chromium/mac/app-temp.icns"
echo ""

echo "Copying SVG logos..."
copy_asset "svg/product_logo.svg" "chrome/app/theme/chromium/product_logo.svg"
echo ""

echo "Copying root product logos..."
copy_asset "product_logo_128.png" "chrome/app/theme/chromium/product_logo_128.png"
copy_asset "product_logo_16.png" "chrome/app/theme/chromium/product_logo_16.png"
copy_asset "product_logo_22_mono.png" "chrome/app/theme/chromium/product_logo_22_mono.png"
copy_asset "product_logo_24.png" "chrome/app/theme/chromium/product_logo_24.png"
copy_asset "product_logo_256.png" "chrome/app/theme/chromium/product_logo_256.png"
copy_asset "product_logo_48.png" "chrome/app/theme/chromium/product_logo_48.png"
copy_asset "product_logo_64.png" "chrome/app/theme/chromium/product_logo_64.png"
echo ""

echo "Copying 100% scale assets..."
copy_asset "100_percent/product_logo_16.png" "chrome/app/theme/default_100_percent/chromium/product_logo_16.png"
copy_asset "100_percent/product_logo_16_white.png" "chrome/app/theme/default_100_percent/chromium/product_logo_16_white.png"
copy_asset "100_percent/product_logo_32.png" "chrome/app/theme/default_100_percent/chromium/product_logo_32.png"
copy_asset "100_percent/product_logo_32_white.png" "chrome/app/theme/default_100_percent/chromium/product_logo_32_white.png"
copy_asset "100_percent/product_logo_name_22.png" "chrome/app/theme/default_100_percent/chromium/product_logo_name_22.png"
copy_asset "100_percent/product_logo_name_22_white.png" "chrome/app/theme/default_100_percent/chromium/product_logo_name_22_white.png"
copy_asset "100_percent/product_logo_16_root.png" "chrome/app/theme/default_100_percent/product_logo_16.png"
echo ""

echo "Copying 200% scale assets..."
copy_asset "200_percent/product_logo_16.png" "chrome/app/theme/default_200_percent/chromium/product_logo_16.png"
copy_asset "200_percent/product_logo_16_white.png" "chrome/app/theme/default_200_percent/chromium/product_logo_16_white.png"
copy_asset "200_percent/product_logo_32.png" "chrome/app/theme/default_200_percent/chromium/product_logo_32.png"
copy_asset "200_percent/product_logo_32_white.png" "chrome/app/theme/default_200_percent/chromium/product_logo_32_white.png"
copy_asset "200_percent/product_logo_name_22.png" "chrome/app/theme/default_200_percent/chromium/product_logo_name_22.png"
copy_asset "200_percent/product_logo_name_22_white.png" "chrome/app/theme/default_200_percent/chromium/product_logo_name_22_white.png"
echo ""

echo "Copying common assets (favicons)..."
copy_asset "common/favicon_ntp_100.png" "chrome/app/theme/default_100_percent/common/favicon_ntp.png"
copy_asset "common/favicon_ntp_200.png" "chrome/app/theme/default_200_percent/common/favicon_ntp.png"
echo ""

echo "Copying new tab page icons..."
copy_asset "ntp_icons/black_logo.svg" "chrome/browser/resources/new_tab_page/icons/Black logo.svg"
copy_asset "ntp_icons/openbrowser_logo_black.png" "chrome/browser/resources/new_tab_page/icons/openbrowser_logo_black.png"
copy_asset "ntp_icons/openbrowser_logo_white.png" "chrome/browser/resources/new_tab_page/icons/openbrowser_logo_white.png"
echo ""

echo "Copying side panel icons..."
copy_asset "side_panel_icons/mini_new_tab_page.svg" "chrome/browser/resources/side_panel/customize_chrome/icons/mini_new_tab_page.svg"
echo ""

echo "Copying vector icons..."
copy_asset "vector_icons/openbrowser_logo.icon" "chrome/app/vector_icons/openbrowser_logo.icon"
echo ""

echo "========================================="
echo "✅ Branding assets applied successfully!"
echo "========================================="
