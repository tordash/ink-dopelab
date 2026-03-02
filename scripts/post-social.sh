#!/usr/bin/env bash
#
# post-social.sh — Auto-post INK by DopeLab articles to social media via Blotato API
#
# Usage:
#   ./scripts/post-social.sh <slug> [options]
#
# Options:
#   --platform fb|ig|both    Platform to post (default: both)
#   --dry-run                Show caption without posting
#   --schedule <ISO8601>     Schedule for later (e.g. 2026-03-03T10:00:00+07:00)
#   --caption <text>         Use custom caption instead of AI-generated
#   --media <url1,url2>      Attach media URLs (comma-separated)
#   --lang th|en             Article language (default: th)
#   --help                   Show usage

set -euo pipefail

# ── Project root ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/social-config.json"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Defaults ─────────────────────────────────────────────────────────────────
PLATFORM="both"
LANG="th"
DRY_RUN=false
SCHEDULE=""
CUSTOM_CAPTION=""
MEDIA_URLS=""
SLUG=""

# ── Usage ────────────────────────────────────────────────────────────────────
usage() {
  cat <<'USAGE'
post-social.sh — Auto-post INK by DopeLab articles to social media

Usage:
  ./scripts/post-social.sh <slug> [options]

Options:
  --platform fb|ig|both    Platform to post (default: both)
  --dry-run                Show caption without posting
  --schedule <ISO8601>     Schedule for later (e.g. 2026-03-03T10:00:00+07:00)
  --caption <text>         Use custom caption instead of AI-generated
  --media <url1,url2>      Attach media URLs (comma-separated)
  --lang th|en             Article language (default: th)
  --help                   Show usage

Examples:
  # Dry run — preview caption without posting
  ./scripts/post-social.sh ai-carousel-pipeline --dry-run

  # Post to Facebook only
  ./scripts/post-social.sh cost-analysis-with-ai --platform fb

  # Schedule for tomorrow 10am (Bangkok time)
  ./scripts/post-social.sh stock-bot-for-staff --schedule 2026-03-03T10:00:00+07:00

  # Custom caption with media
  ./scripts/post-social.sh remote-dev-setup --caption "Check this out!" --media "https://example.com/img.jpg"

  # English article
  ./scripts/post-social.sh ai-carousel-pipeline --lang en

Environment Variables:
  ANTHROPIC_API_KEY   Required for AI caption generation
  BLOTATO_API_KEY     Required for posting (not needed with --dry-run)
USAGE
  exit 0
}

# ── Parse arguments ──────────────────────────────────────────────────────────
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --platform)
        PLATFORM="${2:-}"
        if [[ -z "$PLATFORM" || ! "$PLATFORM" =~ ^(fb|ig|both)$ ]]; then
          die "Invalid platform: '$PLATFORM'. Must be fb, ig, or both."
        fi
        shift 2
        ;;
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      --schedule)
        SCHEDULE="${2:-}"
        if [[ -z "$SCHEDULE" ]]; then
          die "--schedule requires an ISO8601 datetime value."
        fi
        shift 2
        ;;
      --caption)
        CUSTOM_CAPTION="${2:-}"
        if [[ -z "$CUSTOM_CAPTION" ]]; then
          die "--caption requires a text value."
        fi
        shift 2
        ;;
      --media)
        MEDIA_URLS="${2:-}"
        if [[ -z "$MEDIA_URLS" ]]; then
          die "--media requires comma-separated URLs."
        fi
        shift 2
        ;;
      --lang)
        LANG="${2:-}"
        if [[ -z "$LANG" || ! "$LANG" =~ ^(th|en)$ ]]; then
          die "Invalid language: '$LANG'. Must be th or en."
        fi
        shift 2
        ;;
      --help|-h)
        usage
        ;;
      -*)
        die "Unknown option: $1. Use --help for usage."
        ;;
      *)
        if [[ -z "$SLUG" ]]; then
          SLUG="$1"
        else
          die "Unexpected argument: $1"
        fi
        shift
        ;;
    esac
  done

  if [[ -z "$SLUG" ]]; then
    die "Missing required argument: <slug>. Use --help for usage."
  fi
}

# ── Helpers ──────────────────────────────────────────────────────────────────
die() {
  echo -e "${RED}Error:${NC} $1" >&2
  exit 1
}

info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
  echo -e "${GREEN}[OK]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

# ── Validate dependencies ───────────────────────────────────────────────────
check_deps() {
  if ! command -v jq &>/dev/null; then
    die "jq is required but not installed. Install with: brew install jq"
  fi
  if ! command -v curl &>/dev/null; then
    die "curl is required but not installed."
  fi
}

# ── Read config ──────────────────────────────────────────────────────────────
read_config() {
  if [[ ! -f "$CONFIG_FILE" ]]; then
    die "Config file not found: $CONFIG_FILE"
  fi

  BLOTATO_API_BASE=$(jq -r '.urls.blotato_api' "$CONFIG_FILE")
  BLOG_BASE=$(jq -r '.urls.blog_base' "$CONFIG_FILE")

  FB_ACCOUNT_ID=$(jq -r '.accounts.facebook.accountId' "$CONFIG_FILE")
  FB_PAGE_ID=$(jq -r '.accounts.facebook.pageId' "$CONFIG_FILE")
  FB_NAME=$(jq -r '.accounts.facebook.name' "$CONFIG_FILE")

  IG_ACCOUNT_ID=$(jq -r '.accounts.instagram.accountId' "$CONFIG_FILE")
  IG_USERNAME=$(jq -r '.accounts.instagram.username' "$CONFIG_FILE")
}

# ── Read article frontmatter ────────────────────────────────────────────────
read_article() {
  local mdx_path="$PROJECT_ROOT/content/posts/${LANG}/${SLUG}.mdx"

  if [[ ! -f "$mdx_path" ]]; then
    die "Article not found: $mdx_path"
  fi

  info "Reading article: $mdx_path"

  # Extract frontmatter block (between --- delimiters)
  local frontmatter
  frontmatter=$(sed -n '/^---$/,/^---$/p' "$mdx_path" | sed '1d;$d')

  # Parse frontmatter fields
  ARTICLE_TITLE=$(echo "$frontmatter" | sed -n 's/^title: *"\(.*\)"/\1/p')
  ARTICLE_DESC=$(echo "$frontmatter" | sed -n 's/^description: *"\(.*\)"/\1/p')
  ARTICLE_CATEGORY=$(echo "$frontmatter" | sed -n 's/^category: *"\(.*\)"/\1/p')
  ARTICLE_DATE=$(echo "$frontmatter" | sed -n 's/^date: *\(.*\)/\1/p')

  # Parse tags array — e.g. ["tag1", "tag2"] → tag1, tag2
  ARTICLE_TAGS=$(echo "$frontmatter" | sed -n 's/^tags: *\[\(.*\)\]/\1/p' | sed 's/"//g; s/, */, /g')

  # Read body (everything after second ---)
  ARTICLE_BODY=$(sed -n '/^---$/,/^---$/!p' "$mdx_path" | tail -n +1)

  # Article URL
  ARTICLE_URL="${BLOG_BASE}/${LANG}/blog/${SLUG}"

  if [[ -z "$ARTICLE_TITLE" ]]; then
    die "Could not parse title from frontmatter."
  fi

  echo ""
  echo -e "${CYAN}Article:${NC}"
  echo -e "  Title:    ${BOLD}${ARTICLE_TITLE}${NC}"
  echo -e "  Desc:     ${ARTICLE_DESC}"
  echo -e "  Category: ${ARTICLE_CATEGORY}"
  echo -e "  Tags:     ${ARTICLE_TAGS}"
  echo -e "  Date:     ${ARTICLE_DATE}"
  echo -e "  URL:      ${ARTICLE_URL}"
  echo ""
}

# ── Generate caption via Claude API ──────────────────────────────────────────
generate_caption() {
  local platform="$1"  # "facebook" or "instagram"

  if [[ -n "$CUSTOM_CAPTION" ]]; then
    echo "$CUSTOM_CAPTION"
    return
  fi

  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    die "ANTHROPIC_API_KEY is not set. Required for AI caption generation."
  fi

  local platform_instruction
  if [[ "$platform" == "facebook" ]]; then
    platform_instruction="Write for Facebook. The caption can be longer (300-500 characters). Use a conversational, storytelling tone. Encourage engagement (comments, shares)."
  else
    platform_instruction="Write for Instagram. Keep it shorter (200-300 characters). Make it punchy, visual, and impactful. Use line breaks for readability."
  fi

  # Truncate body to first 1500 chars for context
  local body_excerpt
  body_excerpt=$(echo "$ARTICLE_BODY" | head -c 1500)

  # Build the messages JSON
  local request_body
  request_body=$(jq -n \
    --arg model "claude-sonnet-4-6-20250514" \
    --arg system "You are a social media copywriter for DopeLab Studio, a digital marketing agency that uses AI tools in real work. Write engaging Thai social media captions for blog articles. Brand tone: practical, AI-savvy, shares real experience, not salesy. Always include relevant emojis. End with 3-5 hashtags. Always include the article link." \
    --arg platform_inst "$platform_instruction" \
    --arg title "$ARTICLE_TITLE" \
    --arg desc "$ARTICLE_DESC" \
    --arg category "$ARTICLE_CATEGORY" \
    --arg tags "$ARTICLE_TAGS" \
    --arg url "$ARTICLE_URL" \
    --arg body "$body_excerpt" \
    '{
      model: $model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: ("Write a social media caption for this blog article.\n\n" + $platform_inst + "\n\nArticle Title: " + $title + "\nDescription: " + $desc + "\nCategory: " + $category + "\nTags: " + $tags + "\nURL: " + $url + "\n\nArticle excerpt:\n" + $body + "\n\nWrite the caption now. Output ONLY the caption text, nothing else.")
        }
      ]
    }')

  info "Generating ${platform} caption via Claude API..."

  local response
  response=$(curl -s -w "\n%{http_code}" \
    "https://api.anthropic.com/v1/messages" \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${ANTHROPIC_API_KEY}" \
    -H "anthropic-version: 2023-06-01" \
    -d "$request_body")

  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" != "200" ]]; then
    local error_msg
    error_msg=$(echo "$body" | jq -r '.error.message // .error // "Unknown error"' 2>/dev/null || echo "$body")
    die "Claude API error (HTTP $http_code): $error_msg"
  fi

  local caption
  caption=$(echo "$body" | jq -r '.content[0].text // empty')

  if [[ -z "$caption" ]]; then
    die "Claude API returned empty caption. Response: $body"
  fi

  echo "$caption"
}

# ── Post to Blotato API ─────────────────────────────────────────────────────
post_to_blotato() {
  local platform="$1"   # "facebook" or "instagram"
  local caption="$2"

  if [[ -z "${BLOTATO_API_KEY:-}" ]]; then
    die "BLOTATO_API_KEY is not set. Required for posting."
  fi

  local account_id page_id_field
  if [[ "$platform" == "facebook" ]]; then
    account_id="$FB_ACCOUNT_ID"
    page_id_field=", \"pageId\": \"$FB_PAGE_ID\""
  else
    account_id="$IG_ACCOUNT_ID"
    page_id_field=""
  fi

  # Build media URLs array
  local media_json="[]"
  if [[ -n "$MEDIA_URLS" ]]; then
    media_json=$(echo "$MEDIA_URLS" | tr ',' '\n' | jq -R . | jq -s .)
  fi

  # Instagram requires at least 1 media URL
  if [[ "$platform" == "instagram" && "$media_json" == "[]" ]]; then
    warn "Instagram requires at least 1 media URL. Skipping IG post."
    warn "Use --media <url> to attach an image."
    return 1
  fi

  # Build request body
  local request_body
  request_body=$(jq -n \
    --arg accountId "$account_id" \
    --arg platform "$platform" \
    --arg text "$caption" \
    --argjson mediaUrls "$media_json" \
    '{
      accountId: $accountId,
      platform: $platform,
      text: $text,
      mediaUrls: $mediaUrls
    }')

  # Add pageId for Facebook
  if [[ "$platform" == "facebook" ]]; then
    request_body=$(echo "$request_body" | jq --arg pageId "$FB_PAGE_ID" '. + {pageId: $pageId}')
  fi

  # Add scheduled time if set
  if [[ -n "$SCHEDULE" ]]; then
    request_body=$(echo "$request_body" | jq --arg t "$SCHEDULE" '. + {scheduledTime: $t}')
  fi

  info "Posting to ${platform}..."

  local response
  response=$(curl -s -w "\n%{http_code}" \
    "${BLOTATO_API_BASE}/posts" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${BLOTATO_API_KEY}" \
    -d "$request_body")

  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
    local post_id
    post_id=$(echo "$body" | jq -r '.id // .postId // "unknown"' 2>/dev/null)
    if [[ -n "$SCHEDULE" ]]; then
      success "${platform} post scheduled! (ID: ${post_id}, time: ${SCHEDULE})"
    else
      success "${platform} post created! (ID: ${post_id})"
    fi
  else
    local error_msg
    error_msg=$(echo "$body" | jq -r '.message // .error // "Unknown error"' 2>/dev/null || echo "$body")
    echo -e "${RED}[FAIL]${NC} ${platform} post failed (HTTP $http_code): $error_msg"
    return 1
  fi
}

# ── Display caption ──────────────────────────────────────────────────────────
display_caption() {
  local platform="$1"
  local caption="$2"

  echo ""
  local platform_upper
  platform_upper=$(echo "$platform" | tr '[:lower:]' '[:upper:]')
  echo -e "${CYAN}=== ${platform_upper} Caption ===${NC}"
  echo "────────────────────────────────────────"
  echo "$caption"
  echo "────────────────────────────────────────"
  echo ""
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
  parse_args "$@"
  check_deps
  read_config
  read_article

  local fb_caption="" ig_caption=""
  local fb_ok=true ig_ok=true

  # Generate captions
  if [[ "$PLATFORM" == "fb" || "$PLATFORM" == "both" ]]; then
    fb_caption=$(generate_caption "facebook")
    display_caption "Facebook" "$fb_caption"
  fi

  if [[ "$PLATFORM" == "ig" || "$PLATFORM" == "both" ]]; then
    # Reuse FB caption for IG if custom, otherwise generate platform-specific
    if [[ -n "$CUSTOM_CAPTION" ]]; then
      ig_caption="$CUSTOM_CAPTION"
    else
      ig_caption=$(generate_caption "instagram")
    fi
    display_caption "Instagram" "$ig_caption"
  fi

  # Dry run stops here
  if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}[DRY RUN]${NC} No posts were made. Remove --dry-run to post."
    exit 0
  fi

  echo -e "${BOLD}Posting to social media...${NC}"
  echo ""

  # Post to platforms
  if [[ "$PLATFORM" == "fb" || "$PLATFORM" == "both" ]]; then
    post_to_blotato "facebook" "$fb_caption" || fb_ok=false
  fi

  if [[ "$PLATFORM" == "ig" || "$PLATFORM" == "both" ]]; then
    post_to_blotato "instagram" "$ig_caption" || ig_ok=false
  fi

  # Summary
  echo ""
  echo -e "${BOLD}=== Summary ===${NC}"
  echo -e "  Article: ${ARTICLE_TITLE}"
  echo -e "  URL:     ${ARTICLE_URL}"
  if [[ "$PLATFORM" == "fb" || "$PLATFORM" == "both" ]]; then
    if $fb_ok; then
      echo -e "  FB:      ${GREEN}Posted${NC}"
    else
      echo -e "  FB:      ${RED}Failed${NC}"
    fi
  fi
  if [[ "$PLATFORM" == "ig" || "$PLATFORM" == "both" ]]; then
    if $ig_ok; then
      echo -e "  IG:      ${GREEN}Posted${NC}"
    else
      echo -e "  IG:      ${YELLOW}Skipped/Failed${NC}"
    fi
  fi
  if [[ -n "$SCHEDULE" ]]; then
    echo -e "  Scheduled: ${SCHEDULE}"
  fi
  echo ""
}

main "$@"
