#!/bin/bash
# OpenBrowser Patch Application Script
# Usage: ./apply_patches.sh <patches_directory> <source_directory>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -ne 2 ]; then
    echo -e "${RED}Usage: $0 <patches_directory> <source_directory>${NC}"
    echo ""
    echo "Example:"
    echo "  $0 ./patches ../chromium/src"
    exit 1
fi

PATCHES_DIR="$1"
SOURCE_DIR="$2"

# Convert to absolute paths
PATCHES_DIR="$(cd "$PATCHES_DIR" 2>/dev/null && pwd)" || {
    echo -e "${RED}Error: Patches directory not found: $1${NC}"
    exit 1
}

SOURCE_DIR="$(cd "$SOURCE_DIR" 2>/dev/null && pwd)" || {
    echo -e "${RED}Error: Source directory not found: $2${NC}"
    exit 1
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}OpenBrowser Patch Application Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Patches Directory: ${GREEN}$PATCHES_DIR${NC}"
echo -e "Source Directory:  ${GREEN}$SOURCE_DIR${NC}"
echo ""

# Find all patch files and sort them
mapfile -t PATCH_FILES < <(find "$PATCHES_DIR" -name "*.patch" -type f | sort)

if [ ${#PATCH_FILES[@]} -eq 0 ]; then
    echo -e "${YELLOW}No patch files found in $PATCHES_DIR${NC}"
    exit 0
fi

echo -e "${GREEN}Found ${#PATCH_FILES[@]} patch file(s):${NC}"
for i in "${!PATCH_FILES[@]}"; do
    RELATIVE_PATH="${PATCH_FILES[$i]#$PATCHES_DIR/}"
    echo -e "  $((i+1)). $RELATIVE_PATH"
done
echo ""

# Statistics
APPLIED=0
SKIPPED=0
FAILED=0

# Apply patches
for i in "${!PATCH_FILES[@]}"; do
    PATCH_FILE="${PATCH_FILES[$i]}"
    RELATIVE_PATH="${PATCH_FILE#$PATCHES_DIR/}"

    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Patch $((i+1))/${#PATCH_FILES[@]}: $RELATIVE_PATH${NC}"
    echo -e "${BLUE}========================================${NC}"

    # Ask user what to do
    while true; do
        echo -e "${YELLOW}Options:${NC}"
        echo -e "  [a] Apply this patch"
        echo -e "  [s] Skip this patch"
        echo -e "  [v] View patch contents"
        echo -e "  [q] Quit (abort remaining patches)"
        echo ""
        read -p "What would you like to do? [a/s/v/q]: " choice

        case "$choice" in
            a|A)
                echo -e "${GREEN}Applying patch...${NC}"
                cd "$SOURCE_DIR"

                if git apply --check "$PATCH_FILE" 2>/dev/null; then
                    git apply "$PATCH_FILE"
                    echo -e "${GREEN}✓ Patch applied successfully!${NC}"
                    APPLIED=$((APPLIED + 1))
                    break
                else
                    echo -e "${RED}✗ Patch failed to apply cleanly${NC}"
                    echo -e "${YELLOW}Attempting to apply with 3-way merge...${NC}"

                    if git apply --3way "$PATCH_FILE" 2>/dev/null; then
                        echo -e "${GREEN}✓ Patch applied with 3-way merge!${NC}"
                        APPLIED=$((APPLIED + 1))
                        break
                    else
                        echo -e "${RED}✗ Patch failed to apply even with 3-way merge${NC}"
                        FAILED=$((FAILED + 1))

                        echo -e "${YELLOW}Would you like to:${NC}"
                        echo -e "  [c] Continue to next patch"
                        echo -e "  [q] Quit"
                        read -p "Choice [c/q]: " fail_choice

                        if [[ "$fail_choice" == "q" || "$fail_choice" == "Q" ]]; then
                            echo -e "${RED}Aborting...${NC}"
                            exit 1
                        fi
                        break
                    fi
                fi
                ;;
            s|S)
                echo -e "${YELLOW}⊘ Skipping patch${NC}"
                SKIPPED=$((SKIPPED + 1))
                break
                ;;
            v|V)
                echo -e "${BLUE}--- Patch Contents ---${NC}"
                cat "$PATCH_FILE"
                echo -e "${BLUE}--- End of Patch ---${NC}"
                echo ""
                ;;
            q|Q)
                echo -e "${YELLOW}Quitting...${NC}"
                echo ""
                echo -e "${BLUE}========================================${NC}"
                echo -e "${BLUE}Summary${NC}"
                echo -e "${BLUE}========================================${NC}"
                echo -e "${GREEN}Applied:  $APPLIED${NC}"
                echo -e "${YELLOW}Skipped:  $SKIPPED${NC}"
                echo -e "${RED}Failed:   $FAILED${NC}"
                echo -e "${BLUE}Aborted:  $((${#PATCH_FILES[@]} - APPLIED - SKIPPED - FAILED))${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid choice. Please enter a, s, v, or q.${NC}"
                ;;
        esac
    done
    echo ""
done

# Final summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}All patches processed!${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Applied:  $APPLIED${NC}"
echo -e "${YELLOW}Skipped:  $SKIPPED${NC}"
echo -e "${RED}Failed:   $FAILED${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${YELLOW}⚠ Some patches failed to apply. Please review the output above.${NC}"
    exit 1
else
    echo -e "${GREEN}✓ All patches processed successfully!${NC}"
    exit 0
fi
