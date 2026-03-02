#!/usr/bin/env bash
#
# new-article.sh — Scaffold a new bilingual MDX article for INK by DopeLab
#
# Usage:
#   ./scripts/new-article.sh <slug> [--category "Category"] [--tags "t1,t2"] [--featured]
#
# Creates:
#   content/posts/th/<slug>.mdx
#   content/posts/en/<slug>.mdx

set -euo pipefail

# ── Project root (resolve relative to script location) ──────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TH_DIR="$PROJECT_ROOT/content/posts/th"
EN_DIR="$PROJECT_ROOT/content/posts/en"

# ── Valid categories ─────────────────────────────────────────────────────────
VALID_CATEGORIES=(
  "AI Workflow"
  "Developer Tools"
  "Agency Tools"
  "AI for Restaurant"
  "AI Content"
)

# ── Defaults ─────────────────────────────────────────────────────────────────
SLUG=""
CATEGORY=""
TAGS=""
FEATURED="false"

# ── Help ─────────────────────────────────────────────────────────────────────
show_help() {
  cat <<'HELP'
new-article.sh — Scaffold a new bilingual MDX article

Usage:
  ./scripts/new-article.sh <slug> [options]

Arguments:
  slug              URL-friendly article identifier (e.g. "my-new-post")

Options:
  --category NAME   Article category (prompted if omitted)
  --tags "a,b,c"    Comma-separated tags
  --featured        Mark as featured article
  --help            Show this help

Available categories:
  AI Workflow | Developer Tools | Agency Tools | AI for Restaurant | AI Content

Examples:
  ./scripts/new-article.sh remote-dev-setup
  ./scripts/new-article.sh ai-seo --category "AI Workflow" --tags "seo,ai" --featured
HELP
}

# ── Parse arguments ──────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h)
      show_help
      exit 0
      ;;
    --category)
      CATEGORY="$2"
      shift 2
      ;;
    --tags)
      TAGS="$2"
      shift 2
      ;;
    --featured)
      FEATURED="true"
      shift
      ;;
    -*)
      echo "Error: Unknown option '$1'"
      echo "Run with --help for usage."
      exit 1
      ;;
    *)
      if [ -z "$SLUG" ]; then
        SLUG="$1"
      else
        echo "Error: Unexpected argument '$1'"
        exit 1
      fi
      shift
      ;;
  esac
done

# ── Validate slug ────────────────────────────────────────────────────────────
if [ -z "$SLUG" ]; then
  echo "Error: slug is required."
  echo "Usage: ./scripts/new-article.sh <slug> [--category \"...\"] [--tags \"...\"] [--featured]"
  exit 1
fi

if ! echo "$SLUG" | grep -qE '^[a-z0-9][a-z0-9-]*[a-z0-9]$'; then
  echo "Error: slug must be lowercase alphanumeric with hyphens (e.g. 'my-new-post')."
  exit 1
fi

# ── Check files don't already exist ──────────────────────────────────────────
TH_FILE="$TH_DIR/$SLUG.mdx"
EN_FILE="$EN_DIR/$SLUG.mdx"

if [ -f "$TH_FILE" ]; then
  echo "Error: $TH_FILE already exists. Aborting."
  exit 1
fi

if [ -f "$EN_FILE" ]; then
  echo "Error: $EN_FILE already exists. Aborting."
  exit 1
fi

# ── Prompt for category if not provided ──────────────────────────────────────
if [ -z "$CATEGORY" ]; then
  echo "Select a category:"
  for i in "${!VALID_CATEGORIES[@]}"; do
    echo "  $((i + 1)). ${VALID_CATEGORIES[$i]}"
  done
  printf "Enter number (1-%d): " "${#VALID_CATEGORIES[@]}"
  read -r choice
  if [[ "$choice" =~ ^[1-5]$ ]]; then
    CATEGORY="${VALID_CATEGORIES[$((choice - 1))]}"
  else
    echo "Error: Invalid choice."
    exit 1
  fi
fi

# ── Validate category ───────────────────────────────────────────────────────
category_valid=false
for valid in "${VALID_CATEGORIES[@]}"; do
  if [ "$CATEGORY" = "$valid" ]; then
    category_valid=true
    break
  fi
done

if [ "$category_valid" = false ]; then
  echo "Error: Invalid category '$CATEGORY'."
  echo "Valid categories: ${VALID_CATEGORIES[*]}"
  exit 1
fi

# ── Build tags array string ──────────────────────────────────────────────────
if [ -n "$TAGS" ]; then
  # Convert "tag1,tag2,tag3" → ["tag1", "tag2", "tag3"]
  TAGS_ARRAY="["
  first=true
  IFS=',' read -ra TAG_LIST <<< "$TAGS"
  for tag in "${TAG_LIST[@]}"; do
    tag="$(echo "$tag" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [ "$first" = true ]; then
      TAGS_ARRAY="$TAGS_ARRAY\"$tag\""
      first=false
    else
      TAGS_ARRAY="$TAGS_ARRAY, \"$tag\""
    fi
  done
  TAGS_ARRAY="$TAGS_ARRAY]"
else
  TAGS_ARRAY="[]"
fi

# ── Date ─────────────────────────────────────────────────────────────────────
TODAY="$(date +%Y-%m-%d)"

# ── Ensure directories exist ─────────────────────────────────────────────────
mkdir -p "$TH_DIR" "$EN_DIR"

# ── Write Thai template ─────────────────────────────────────────────────────
cat > "$TH_FILE" <<EOF
---
title: "หัวข้อบทความ — $SLUG"
description: "คำอธิบายบทความ"
date: $TODAY
category: "$CATEGORY"
tags: $TAGS_ARRAY
featured: $FEATURED
draft: true
---

## ปัญหาที่เจอ

<!-- อธิบายปัญหาหรือ pain point ที่เป็นจุดเริ่มต้น -->

## วิธีแก้

<!-- อธิบาย solution, tools, หรือ approach ที่ใช้ -->

## ผลลัพธ์

<!-- ผลลัพธ์ที่ได้ — ตัวเลข, before/after, impact -->

## สรุป

<!-- key takeaway สำหรับผู้อ่าน -->
EOF

# ── Write English template ───────────────────────────────────────────────────
cat > "$EN_FILE" <<EOF
---
title: "Article Title — $SLUG"
description: "Article description"
date: $TODAY
category: "$CATEGORY"
tags: $TAGS_ARRAY
featured: $FEATURED
draft: true
---

## The Problem

<!-- Describe the problem or pain point that started this -->

## The Solution

<!-- Explain the solution, tools, or approach used -->

## Results

<!-- Outcomes — numbers, before/after, impact -->

## Summary

<!-- Key takeaway for the reader -->
EOF

# ── Success ──────────────────────────────────────────────────────────────────
echo ""
echo "Article scaffolded successfully!"
echo ""
echo "  TH: $TH_FILE"
echo "  EN: $EN_FILE"
echo ""
echo "  Date:     $TODAY"
echo "  Category: $CATEGORY"
echo "  Tags:     $TAGS_ARRAY"
echo "  Featured: $FEATURED"
echo "  Draft:    true"
echo ""
echo "Next steps:"
echo "  1. Edit the Thai article:   code $TH_FILE"
echo "  2. Edit the English article: code $EN_FILE"
echo "  3. Set draft: false when ready to publish"
