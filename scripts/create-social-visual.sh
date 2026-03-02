#!/usr/bin/env bash
#
# create-social-visual.sh — Generate social media visuals from blog articles
# Uses Claude API for content extraction + Blotato Visual API for generation
#
# Usage: ./scripts/create-social-visual.sh <slug> [options]

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TH_DIR="$PROJECT_ROOT/content/posts/th"
EN_DIR="$PROJECT_ROOT/content/posts/en"

CLAUDE_API_URL="https://api.anthropic.com/v1/messages"
CLAUDE_MODEL="claude-sonnet-4-6-20250514"
CLAUDE_API_VERSION="2023-06-01"
CLAUDE_MAX_TOKENS=2048

BLOTATO_API_URL="https://api.blotato.com/api/visuals"

# ─── Template IDs ────────────────────────────────────────────────────────────
TEMPLATE_CAROUSEL="/base/v2/ai-story-video/0ddb8655-c3da-43da-9f7d-be1915ca7818/v1"
TEMPLATE_QUOTES="/base/v2/ai-story-video/ba413be6-a840-4e60-8fd6-0066d3b427df/v1"
TEMPLATE_VIDEO="/base/v2/ai-story-video/5903fe43-514d-40ee-a060-0d6628c5f8fd/v1"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ─── Helpers ─────────────────────────────────────────────────────────────────

die() {
    echo -e "${RED}Error:${NC} $1" >&2
    exit 1
}

info() {
    echo -e "${CYAN}>>>${NC} $1"
}

success() {
    echo -e "${GREEN}>>>${NC} $1"
}

warn() {
    echo -e "${YELLOW}>>>${NC} $1"
}

# ─── Usage ───────────────────────────────────────────────────────────────────

usage() {
    cat <<'USAGE'
create-social-visual.sh — Generate social media visuals from blog articles

Uses Claude API to extract key content from articles, then creates visuals
via Blotato Visual API (carousel slideshows, quote cards, or AI videos).

Usage:
  ./scripts/create-social-visual.sh <slug> [OPTIONS]

Arguments:
  <slug>        Article slug (filename without .mdx extension)
                e.g., "remote-dev-setup"

Options:
  --type TYPE   Visual type: carousel, quotes, video (default: carousel)
  --slides N    Number of slides/quotes/scenes (default: 5)
  --aspect R    Aspect ratio: 9:16, 1:1, 16:9 (default: 1:1)
  --lang LANG   Article language: th, en (default: th)
  --dry-run     Extract content and show payload without calling Blotato API
  --help        Show this help message

Environment:
  ANTHROPIC_API_KEY   Required. Your Anthropic API key.
  BLOTATO_API_KEY     Required (unless --dry-run). Your Blotato API key.

Template Mapping:
  carousel  → Image Slideshow with Prominent Text
  quotes    → Twitter/X Quote Cards
  video     → AI Video with AI Voice

Examples:
  ./scripts/create-social-visual.sh remote-dev-setup
  ./scripts/create-social-visual.sh remote-dev-setup --type quotes --slides 4
  ./scripts/create-social-visual.sh remote-dev-setup --type video --aspect 9:16
  ./scripts/create-social-visual.sh remote-dev-setup --dry-run
  ./scripts/create-social-visual.sh remote-dev-setup --lang en --type carousel
USAGE
}

# ─── Parse Args ──────────────────────────────────────────────────────────────

SLUG=""
VISUAL_TYPE="carousel"
NUM_SLIDES=5
ASPECT_RATIO="1:1"
LANG="th"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --type)
            [[ $# -lt 2 ]] && die "--type requires a value (carousel, quotes, video)"
            VISUAL_TYPE="$2"
            shift 2
            ;;
        --slides)
            [[ $# -lt 2 ]] && die "--slides requires a number"
            NUM_SLIDES="$2"
            shift 2
            ;;
        --aspect)
            [[ $# -lt 2 ]] && die "--aspect requires a value (9:16, 1:1, 16:9)"
            ASPECT_RATIO="$2"
            shift 2
            ;;
        --lang)
            [[ $# -lt 2 ]] && die "--lang requires a value (th, en)"
            LANG="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        -*)
            die "Unknown option: $1 (use --help for usage)"
            ;;
        *)
            if [[ -z "$SLUG" ]]; then
                SLUG="$1"
            else
                die "Unexpected argument: $1 (only one slug allowed)"
            fi
            shift
            ;;
    esac
done

if [[ -z "$SLUG" ]]; then
    usage
    exit 1
fi

# ─── Validate Inputs ────────────────────────────────────────────────────────

# Validate visual type
case "$VISUAL_TYPE" in
    carousel|quotes|video) ;;
    *) die "Invalid type '$VISUAL_TYPE'. Must be: carousel, quotes, or video" ;;
esac

# Validate aspect ratio
case "$ASPECT_RATIO" in
    9:16|1:1|16:9) ;;
    *) die "Invalid aspect ratio '$ASPECT_RATIO'. Must be: 9:16, 1:1, or 16:9" ;;
esac

# Validate language
case "$LANG" in
    th|en) ;;
    *) die "Invalid language '$LANG'. Must be: th or en" ;;
esac

# Validate slides count
if ! [[ "$NUM_SLIDES" =~ ^[0-9]+$ ]] || [[ "$NUM_SLIDES" -lt 1 ]] || [[ "$NUM_SLIDES" -gt 10 ]]; then
    die "Slides must be a number between 1 and 10"
fi

# Check article file exists
if [[ "$LANG" == "th" ]]; then
    ARTICLE_FILE="$TH_DIR/${SLUG}.mdx"
else
    ARTICLE_FILE="$EN_DIR/${SLUG}.mdx"
fi

if [[ ! -f "$ARTICLE_FILE" ]]; then
    die "Article not found: $ARTICLE_FILE"
fi

# Check jq
if ! command -v jq &>/dev/null; then
    die "jq is required but not installed. Install with: brew install jq"
fi

# Check ANTHROPIC_API_KEY (needed for extraction even in dry-run)
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    die "ANTHROPIC_API_KEY environment variable is not set.\nExport it with: export ANTHROPIC_API_KEY='sk-ant-...'"
fi

# Check BLOTATO_API_KEY (only needed for actual API call)
if [[ "$DRY_RUN" == false ]] && [[ -z "${BLOTATO_API_KEY:-}" ]]; then
    die "BLOTATO_API_KEY environment variable is not set.\nExport it with: export BLOTATO_API_KEY='...'\nOr use --dry-run to preview without calling Blotato."
fi

# ─── Select Template ────────────────────────────────────────────────────────

case "$VISUAL_TYPE" in
    carousel) TEMPLATE_ID="$TEMPLATE_CAROUSEL"; TEMPLATE_NAME="Image Slideshow with Prominent Text" ;;
    quotes)   TEMPLATE_ID="$TEMPLATE_QUOTES";   TEMPLATE_NAME="Twitter/X Quote Cards" ;;
    video)    TEMPLATE_ID="$TEMPLATE_VIDEO";     TEMPLATE_NAME="AI Video with AI Voice" ;;
esac

# ─── Display Plan ────────────────────────────────────────────────────────────

echo ""
info "Social Visual Generator"
echo -e "  Article:  ${BOLD}$ARTICLE_FILE${NC}"
echo -e "  Type:     ${BOLD}$VISUAL_TYPE${NC} ($TEMPLATE_NAME)"
echo -e "  Slides:   ${BOLD}$NUM_SLIDES${NC}"
echo -e "  Aspect:   ${BOLD}$ASPECT_RATIO${NC}"
echo -e "  Language: ${BOLD}$LANG${NC}"
if [[ "$DRY_RUN" == true ]]; then
    echo -e "  Mode:     ${YELLOW}DRY RUN${NC}"
fi
echo ""

# ─── Read Article Content ────────────────────────────────────────────────────

ARTICLE_CONTENT="$(cat "$ARTICLE_FILE")"

# Strip frontmatter for the prompt (content only, skip --- delimiters)
ARTICLE_BODY=$(echo "$ARTICLE_CONTENT" | awk 'BEGIN{n=0} /^---$/{n++; next} n>=2{print}')
ARTICLE_TITLE=$(echo "$ARTICLE_CONTENT" | awk '/^title:/{gsub(/^title: *"?|"? *$/,"",$0); print; exit}')

info "Article: ${BOLD}$ARTICLE_TITLE${NC}"

# ─── Build Claude API Prompt ─────────────────────────────────────────────────

SYSTEM_PROMPT="You are a social media content strategist for DopeLab Studio, a digital marketing agency. Extract key points from this blog article for a social media visual."

case "$VISUAL_TYPE" in
    carousel)
        USER_PROMPT="Extract $NUM_SLIDES key takeaways from this blog article for a carousel slideshow. Each should be a short, impactful statement (max 15 words Thai or 20 words English). Return as a JSON array of strings.

Do NOT include any explanation or markdown — output ONLY the JSON array.

Article:
$ARTICLE_BODY"
        ;;
    quotes)
        USER_PROMPT="Extract $NUM_SLIDES quotable lines from this blog article that would make good standalone social media posts. Each should be memorable, insightful, and self-contained. Return as a JSON array of strings.

Do NOT include any explanation or markdown — output ONLY the JSON array.

Article:
$ARTICLE_BODY"
        ;;
    video)
        USER_PROMPT="Create $NUM_SLIDES scene descriptions with voiceover scripts from this blog article. Each scene should cover a key section. Voiceover should be natural Thai (2-3 sentences each). Return as a JSON array of objects with keys \"description\" and \"script\".

Do NOT include any explanation or markdown — output ONLY the JSON array.

Article:
$ARTICLE_BODY"
        ;;
esac

# ─── Call Claude API for Content Extraction ──────────────────────────────────

info "Calling Claude API for content extraction..."

CLAUDE_PAYLOAD=$(jq -n \
    --arg model "$CLAUDE_MODEL" \
    --argjson max_tokens "$CLAUDE_MAX_TOKENS" \
    --arg system "$SYSTEM_PROMPT" \
    --arg user_msg "$USER_PROMPT" \
    '{
        model: $model,
        max_tokens: $max_tokens,
        system: $system,
        messages: [
            {
                role: "user",
                content: $user_msg
            }
        ]
    }')

HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    "$CLAUDE_API_URL" \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: $CLAUDE_API_VERSION" \
    -H "content-type: application/json" \
    -d "$CLAUDE_PAYLOAD" \
    2>&1)

HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1)

if [[ "$HTTP_CODE" != "200" ]]; then
    ERROR_MSG=$(echo "$HTTP_BODY" | jq -r '.error.message // .error // "Unknown error"' 2>/dev/null || echo "$HTTP_BODY")
    die "Claude API request failed (HTTP $HTTP_CODE): $ERROR_MSG"
fi

API_TYPE=$(echo "$HTTP_BODY" | jq -r '.type // empty' 2>/dev/null)
if [[ "$API_TYPE" == "error" ]]; then
    ERROR_MSG=$(echo "$HTTP_BODY" | jq -r '.error.message // "Unknown API error"' 2>/dev/null)
    die "Claude API error: $ERROR_MSG"
fi

EXTRACTED_TEXT=$(echo "$HTTP_BODY" | jq -r '.content[0].text // empty' 2>/dev/null)

if [[ -z "$EXTRACTED_TEXT" ]]; then
    die "Failed to extract content from Claude API response."
fi

# Strip markdown code fences if present
EXTRACTED_TEXT=$(echo "$EXTRACTED_TEXT" | sed '/^```/d')

# Validate JSON
if ! echo "$EXTRACTED_TEXT" | jq . &>/dev/null; then
    die "Claude returned invalid JSON:\n$EXTRACTED_TEXT"
fi

EXTRACTED_JSON="$EXTRACTED_TEXT"

success "Content extracted successfully"
echo ""

# ─── Display Extracted Content ───────────────────────────────────────────────

echo -e "${BOLD}Extracted Content:${NC}"
echo -e "${DIM}─────────────────────────────────────────${NC}"

case "$VISUAL_TYPE" in
    carousel|quotes)
        ITEM_COUNT=$(echo "$EXTRACTED_JSON" | jq 'length')
        for i in $(seq 0 $((ITEM_COUNT - 1))); do
            ITEM=$(echo "$EXTRACTED_JSON" | jq -r ".[$i]")
            echo -e "  $((i + 1)). $ITEM"
        done
        ;;
    video)
        ITEM_COUNT=$(echo "$EXTRACTED_JSON" | jq 'length')
        for i in $(seq 0 $((ITEM_COUNT - 1))); do
            DESC=$(echo "$EXTRACTED_JSON" | jq -r ".[$i].description")
            SCRIPT=$(echo "$EXTRACTED_JSON" | jq -r ".[$i].script")
            echo -e "  ${BOLD}Scene $((i + 1)):${NC} $DESC"
            echo -e "    Script: $SCRIPT"
            echo ""
        done
        ;;
esac

echo -e "${DIM}─────────────────────────────────────────${NC}"
echo ""

# ─── Build Blotato API Payload ───────────────────────────────────────────────

info "Building Blotato visual request..."

case "$VISUAL_TYPE" in
    carousel)
        # Build slides array: [{text: "...", imageSource: "ai"}]
        SLIDES_JSON=$(echo "$EXTRACTED_JSON" | jq '[.[] | {text: ., imageSource: "ai"}]')
        BLOTATO_PAYLOAD=$(jq -n \
            --arg templateId "$TEMPLATE_ID" \
            --argjson slides "$SLIDES_JSON" \
            --arg slideDuration "3" \
            --arg aspectRatio "$ASPECT_RATIO" \
            '{
                templateId: $templateId,
                inputs: {
                    slides: $slides,
                    slideDuration: $slideDuration,
                    aspectRatio: $aspectRatio
                }
            }')
        ;;
    quotes)
        # Build quotes array from extracted strings
        BLOTATO_PAYLOAD=$(jq -n \
            --arg templateId "$TEMPLATE_ID" \
            --argjson quotes "$EXTRACTED_JSON" \
            --arg authorName "DopeLab Studio" \
            --arg handle "@dopelab.studio" \
            --arg theme "dark" \
            --arg aspectRatio "$ASPECT_RATIO" \
            '{
                templateId: $templateId,
                inputs: {
                    quotes: $quotes,
                    authorName: $authorName,
                    handle: $handle,
                    theme: $theme,
                    aspectRatio: $aspectRatio
                }
            }')
        ;;
    video)
        # Build scenes array: [{mediaSource: "ai", script: "..."}]
        SCENES_JSON=$(echo "$EXTRACTED_JSON" | jq '[.[] | {mediaSource: "ai", script: .script}]')
        BLOTATO_PAYLOAD=$(jq -n \
            --arg templateId "$TEMPLATE_ID" \
            --argjson scenes "$SCENES_JSON" \
            --arg voiceName "Hope" \
            --arg aspectRatio "$ASPECT_RATIO" \
            --arg captionPosition "bottom" \
            --arg transition "fade" \
            '{
                templateId: $templateId,
                inputs: {
                    scenes: $scenes,
                    voiceName: $voiceName,
                    aspectRatio: $aspectRatio,
                    captionPosition: $captionPosition,
                    transition: $transition
                }
            }')
        ;;
esac

# ─── Dry Run: Show Payload and Exit ─────────────────────────────────────────

if [[ "$DRY_RUN" == true ]]; then
    echo ""
    echo -e "${BOLD}Blotato API Payload (dry-run):${NC}"
    echo -e "${DIM}─────────────────────────────────────────${NC}"
    echo "$BLOTATO_PAYLOAD" | jq .
    echo -e "${DIM}─────────────────────────────────────────${NC}"
    echo ""
    warn "DRY RUN complete. No Blotato API call was made."
    echo -e "  To create the visual, run without --dry-run."
    echo ""
    exit 0
fi

# ─── Call Blotato Visual API ─────────────────────────────────────────────────

info "Sending to Blotato Visual API..."

BLOTATO_RESPONSE=$(curl -s -w "\n%{http_code}" \
    "$BLOTATO_API_URL" \
    -H "Authorization: Bearer $BLOTATO_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$BLOTATO_PAYLOAD" \
    2>&1)

BLOTATO_BODY=$(echo "$BLOTATO_RESPONSE" | sed '$d')
BLOTATO_CODE=$(echo "$BLOTATO_RESPONSE" | tail -1)

if [[ "$BLOTATO_CODE" -lt 200 ]] || [[ "$BLOTATO_CODE" -ge 300 ]]; then
    ERROR_MSG=$(echo "$BLOTATO_BODY" | jq -r '.message // .error // "Unknown error"' 2>/dev/null || echo "$BLOTATO_BODY")
    die "Blotato API request failed (HTTP $BLOTATO_CODE): $ERROR_MSG"
fi

# Extract visual ID from response
VISUAL_ID=$(echo "$BLOTATO_BODY" | jq -r '.id // .visualId // empty' 2>/dev/null)

if [[ -z "$VISUAL_ID" ]]; then
    warn "Could not extract visual ID from response."
    echo -e "${BOLD}Full Blotato response:${NC}"
    echo "$BLOTATO_BODY" | jq . 2>/dev/null || echo "$BLOTATO_BODY"
    exit 0
fi

# ─── Success ─────────────────────────────────────────────────────────────────

echo ""
success "Visual creation submitted!"
echo ""
echo -e "  Visual ID:  ${BOLD}$VISUAL_ID${NC}"
echo -e "  Type:       $VISUAL_TYPE ($TEMPLATE_NAME)"
echo -e "  Article:    $ARTICLE_TITLE"
echo -e "  Slides:     $NUM_SLIDES"
echo -e "  Aspect:     $ASPECT_RATIO"
echo ""
echo -e "  Check status: curl -s -H 'Authorization: Bearer \$BLOTATO_API_KEY' \\"
echo -e "    https://api.blotato.com/api/visuals/$VISUAL_ID | jq ."
echo ""
