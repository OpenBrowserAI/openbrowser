#!/bin/bash

# Script to copy OpenBrowser icon assets to Chromium source
# Run this from the openbrowser repository root

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Applying OpenBrowser Icon Assets${NC}"
echo -e "${BLUE}========================================${NC}"

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENBROWSER_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHROMIUM_SRC="${OPENBROWSER_ROOT}/../chromium/src"

# Check if chromium/src exists
if [ ! -d "$CHROMIUM_SRC" ]; then
    echo -e "${RED}Error: Chromium source not found at $CHROMIUM_SRC${NC}"
    echo "Please ensure Chromium is cloned in the parent directory"
    exit 1
fi

echo -e "${GREEN}OpenBrowser Root: $OPENBROWSER_ROOT${NC}"
echo -e "${GREEN}Chromium Source: $CHROMIUM_SRC${NC}"
echo ""

# ============================================
# Copy Linux Icons
# ============================================
echo -e "${BLUE}[1/4] Copying Linux icons...${NC}"
cp -v "$OPENBROWSER_ROOT/branding_assets/icons/linux/"*.png \
    "$CHROMIUM_SRC/chrome/app/theme/chromium/linux/"
echo -e "${GREEN}✓ Linux icons copied${NC}"
echo ""

# ============================================
# Copy macOS AppIcon.appiconset
# ============================================
echo -e "${BLUE}[2/4] Copying macOS AppIcon.appiconset...${NC}"
cp -v "$OPENBROWSER_ROOT/branding_assets/icons/mac/AppIcon.appiconset/"*.png \
    "$CHROMIUM_SRC/chrome/app/theme/chromium/mac/Assets.xcassets/AppIcon.appiconset/"
echo -e "${GREEN}✓ macOS AppIcon.appiconset copied${NC}"
echo ""

# ============================================
# Copy macOS Icon.iconset
# ============================================
echo -e "${BLUE}[3/4] Copying macOS Icon.iconset...${NC}"
cp -v "$OPENBROWSER_ROOT/branding_assets/icons/mac/Icon.iconset/"*.png \
    "$CHROMIUM_SRC/chrome/app/theme/chromium/mac/Assets.xcassets/Icon.iconset/"
echo -e "${GREEN}✓ macOS Icon.iconset copied${NC}"
echo ""

# ============================================
# Copy macOS ICNS and Assets.car
# ============================================
echo -e "${BLUE}[4/4] Copying macOS ICNS and Assets.car...${NC}"
cp -v "$OPENBROWSER_ROOT/branding_assets/icons/mac/app.icns" \
    "$CHROMIUM_SRC/chrome/app/theme/chromium/mac/"
cp -v "$OPENBROWSER_ROOT/branding_assets/icons/mac/AppIcon.icns" \
    "$CHROMIUM_SRC/chrome/app/theme/chromium/mac/"
cp -v "$OPENBROWSER_ROOT/branding_assets/icons/mac/Assets.car" \
    "$CHROMIUM_SRC/chrome/app/theme/chromium/mac/"
echo -e "${GREEN}✓ macOS ICNS and Assets.car copied${NC}"
echo ""

# ============================================
# Summary
# ============================================
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✓ All icon assets applied!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Icon assets have been copied to Chromium source."
echo "Next steps:"
echo "  1. cd ../chromium/src"
echo "  2. autoninja -C out/fast chrome"
echo ""
