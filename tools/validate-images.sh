#!/bin/bash
# validate-images.sh — Pre-publish image validation for INK blog
# Checks ALL MDX files for placeholder/broken image references
# Run before every git push: ./tools/validate-images.sh
# Exit code 1 = broken images found (BLOCK PUSH)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

CONTENT_DIR="content/posts"
PUBLIC_DIR="public"
ERRORS=0
WARNINGS=0
CHECKED=0

echo "========================================="
echo "  INK Blog — Image Validation"
echo "========================================="
echo ""

# Find all MDX files
for mdx in $(find "$CONTENT_DIR" -name "*.mdx" -type f); do
    # Skip drafts
    if grep -q "^draft: true" "$mdx" 2>/dev/null; then
        continue
    fi

    # Extract image paths from markdown syntax ![alt](path)
    images=$(grep -o '!\[.*\]([^)]*)' "$mdx" 2>/dev/null | sed 's/.*](\(.*\))/\1/' || true)

    for img in $images; do
        CHECKED=$((CHECKED + 1))

        # Check 1: Placeholder detection
        if echo "$img" | grep -qi "placeholder"; then
            echo -e "${RED}FAIL${NC} $mdx"
            echo -e "      → ${RED}Placeholder image: $img${NC}"
            ERRORS=$((ERRORS + 1))
            continue
        fi

        # Check 2: External URLs (skip validation but warn)
        if echo "$img" | grep -qE "^https?://"; then
            WARNINGS=$((WARNINGS + 1))
            continue
        fi

        # Check 3: Relative paths starting with ../covers/ (velite handles these)
        if echo "$img" | grep -qE "^\.\./covers/"; then
            cover_path="$CONTENT_DIR/covers/$(echo "$img" | sed 's|../covers/||')"
            if [ ! -f "$cover_path" ]; then
                echo -e "${RED}FAIL${NC} $mdx"
                echo -e "      → ${RED}Missing cover: $cover_path${NC}"
                ERRORS=$((ERRORS + 1))
            fi
            continue
        fi

        # Check 4: Static/public paths
        # Strip leading / for filesystem check
        local_path="${PUBLIC_DIR}${img}"
        if [ ! -f "$local_path" ]; then
            echo -e "${RED}FAIL${NC} $mdx"
            echo -e "      → ${RED}Missing image: $img${NC}"
            echo -e "      → Expected at: $local_path"
            ERRORS=$((ERRORS + 1))
        fi
    done
done

echo ""
echo "========================================="
echo "  Results"
echo "========================================="
echo "  Checked: $CHECKED images"
echo -e "  ${GREEN}Valid${NC}: $((CHECKED - ERRORS - WARNINGS))"
echo -e "  ${YELLOW}External URLs${NC}: $WARNINGS (skipped)"
echo -e "  ${RED}Errors${NC}: $ERRORS"
echo "========================================="

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo -e "${RED}BLOCKED: Fix $ERRORS broken image(s) before publishing!${NC}"
    echo "  Options: gen NB2 from Google AI Studio, create SVG, or use existing image"
    exit 1
else
    echo ""
    echo -e "${GREEN}All images valid. Safe to publish.${NC}"
    exit 0
fi
