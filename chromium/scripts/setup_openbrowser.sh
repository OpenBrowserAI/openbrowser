#!/bin/bash

# OpenBrowser Complete Setup Script
# Runs all necessary scripts to set up OpenBrowser in Chromium

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}"
echo "========================================="
echo "  OpenBrowser Complete Setup"
echo "========================================="
echo -e "${NC}"
echo ""
echo "This script will:"
echo "  1. Apply all patches"
echo "  2. Copy branding assets"
echo "  3. Copy extension to resources"
echo ""

# Step 1: Apply patches
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 1/3: Applying Patches${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if bash "$SCRIPT_DIR/apply_patches.sh"; then
    echo -e "${GREEN}✅ Patches applied successfully${NC}"
else
    echo -e "${RED}❌ Patch application failed${NC}"
    exit 1
fi

echo ""
echo ""

# Step 2: Apply branding assets
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2/3: Applying Branding Assets${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if bash "$SCRIPT_DIR/apply_branding_assets.sh"; then
    echo -e "${GREEN}✅ Branding assets applied successfully${NC}"
else
    echo -e "${RED}❌ Branding assets application failed${NC}"
    exit 1
fi

echo ""
echo ""

# Step 3: Copy extension to resources
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 3/3: Copying Extension to Resources${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if bash "$SCRIPT_DIR/copy_extension_to_resources.sh"; then
    echo -e "${GREEN}✅ Extension copied successfully${NC}"
else
    echo -e "${RED}❌ Extension copy failed${NC}"
    exit 1
fi

echo ""
echo ""

# Final summary
echo -e "${CYAN}"
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo -e "${NC}"
echo ""
echo -e "${GREEN}✅ All steps completed successfully!${NC}"
echo ""
echo "Next steps:"
echo "  1. Build Chromium: autoninja -C out/fast chrome"
echo "  2. Run OpenBrowser: out/fast/Chromium.app/Contents/MacOS/Chromium"
echo ""
