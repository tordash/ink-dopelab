#!/usr/bin/env bash
#
# translate.sh — Auto-translate INK by DopeLab blog articles (TH → EN)
# Uses Claude API (Anthropic Messages API) via curl + jq
#
# Usage: ./scripts/translate.sh <slug> [--dry-run] [--force]

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TH_DIR="$PROJECT_ROOT/content/posts/th"
EN_DIR="$PROJECT_ROOT/content/posts/en"

API_URL="https://api.anthropic.com/v1/messages"
API_MODEL="claude-sonnet-4-6-20250514"
API_VERSION="2023-06-01"
MAX_TOKENS=8192

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── Functions ───────────────────────────────────────────────────────────────

usage() {
    cat <<'USAGE'
Usage: ./scripts/translate.sh <slug> [OPTIONS]

Translate a Thai (.mdx) article to English using the Claude API.

Arguments:
  <slug>        Article slug (filename without .mdx extension)
                e.g., "remote-dev-setup"

Options:
  --dry-run     Show what would happen without writing any files
  --force       Overwrite existing English translation
  --help        Show this help message

Environment:
  ANTHROPIC_API_KEY   Required. Your Anthropic API key.

Examples:
  ./scripts/translate.sh remote-dev-setup
  ./scripts/translate.sh remote-dev-setup --dry-run
  ./scripts/translate.sh remote-dev-setup --force
USAGE
}

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

word_count() {
    wc -w < "$1" | tr -d ' '
}

# ─── Parse Args ──────────────────────────────────────────────────────────────

SLUG=""
DRY_RUN=false
FORCE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
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

# ─── Preflight Checks ───────────────────────────────────────────────────────

# Check source file
TH_FILE="$TH_DIR/${SLUG}.mdx"
EN_FILE="$EN_DIR/${SLUG}.mdx"

if [[ ! -f "$TH_FILE" ]]; then
    die "Thai source file not found: $TH_FILE"
fi

# ─── Read Source ─────────────────────────────────────────────────────────────

TH_CONTENT="$(cat "$TH_FILE")"
TH_WORDS=$(word_count "$TH_FILE")

info "Source: ${BOLD}$TH_FILE${NC}"
info "Target: ${BOLD}$EN_FILE${NC}"
info "Source word count: ${BOLD}$TH_WORDS${NC}"

# ─── Dry Run ─────────────────────────────────────────────────────────────────

if [[ "$DRY_RUN" == true ]]; then
    warn "DRY RUN — no files will be written, no API calls made."
    echo ""
    info "Would translate: $TH_FILE"
    info "Would write to:  $EN_FILE"
    if [[ -f "$EN_FILE" ]]; then
        if [[ "$FORCE" == true ]]; then
            warn "Target file exists — will overwrite (--force)"
        else
            warn "Target file exists — would need --force to overwrite"
        fi
    fi
    exit 0
fi

# ─── Pre-API Checks (skipped in dry-run) ─────────────────────────────────────

# Check jq is available
if ! command -v jq &>/dev/null; then
    die "jq is required but not installed. Install with: brew install jq"
fi

# Check API key
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    die "ANTHROPIC_API_KEY environment variable is not set.\nExport it with: export ANTHROPIC_API_KEY='sk-ant-...'"
fi

# Check target file
if [[ -f "$EN_FILE" && "$FORCE" == false ]]; then
    die "English file already exists: $EN_FILE\nUse --force to overwrite."
fi

# ─── Build API Request ──────────────────────────────────────────────────────

SYSTEM_PROMPT='You are a professional translator for a developer blog called "INK by DopeLab". Translate Thai articles to English following these rules:

TRANSLATION RULES:
1. Translate to natural, fluent English. The tone should be conversational, developer-friendly, and first person.
2. In the YAML frontmatter (between --- markers):
   - Translate "title" and "description" to English
   - Keep "date", "category", "tags", "featured", "draft" values EXACTLY as-is (do not translate tag values)
3. Keep ALL MDX/Markdown syntax intact:
   - ## headings, **bold**, *italic*, [links](url), ![images](url)
   - ```code blocks``` with language annotations
   - Any JSX/MDX components
4. Do NOT translate:
   - Code snippets, terminal commands, file paths, variable names
   - URLs, email addresses
   - Brand names, product names, tool names (Tailscale, tmux, Claude Code, etc.)
5. Keep the same heading structure and approximate paragraph count.
6. Output the COMPLETE translated MDX file including frontmatter (--- delimiters) and body.
7. Output ONLY the translated MDX content — no explanation, no markdown code fences wrapping the output.'

# Escape the content for JSON using jq
USER_MESSAGE="Translate the following Thai MDX article to English. Output ONLY the complete translated MDX file:

$TH_CONTENT"

# Build JSON payload using jq for proper escaping
JSON_PAYLOAD=$(jq -n \
    --arg model "$API_MODEL" \
    --argjson max_tokens "$MAX_TOKENS" \
    --arg system "$SYSTEM_PROMPT" \
    --arg user_msg "$USER_MESSAGE" \
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

# ─── Call API ────────────────────────────────────────────────────────────────

info "Calling Claude API (model: ${BOLD}$API_MODEL${NC})..."

HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    "$API_URL" \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: $API_VERSION" \
    -H "content-type: application/json" \
    -d "$JSON_PAYLOAD" \
    2>&1)

# Split response body and HTTP status code
HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1)

# Check HTTP status
if [[ "$HTTP_CODE" != "200" ]]; then
    ERROR_MSG=$(echo "$HTTP_BODY" | jq -r '.error.message // .error // "Unknown error"' 2>/dev/null || echo "$HTTP_BODY")
    die "API request failed (HTTP $HTTP_CODE): $ERROR_MSG"
fi

# Check for API-level errors
API_TYPE=$(echo "$HTTP_BODY" | jq -r '.type // empty' 2>/dev/null)
if [[ "$API_TYPE" == "error" ]]; then
    ERROR_MSG=$(echo "$HTTP_BODY" | jq -r '.error.message // "Unknown API error"' 2>/dev/null)
    die "API error: $ERROR_MSG"
fi

# Extract translated text from response
TRANSLATED=$(echo "$HTTP_BODY" | jq -r '.content[0].text // empty' 2>/dev/null)

if [[ -z "$TRANSLATED" ]]; then
    die "Failed to extract translated text from API response.\nRaw response:\n$(echo "$HTTP_BODY" | head -20)"
fi

# Strip wrapping code fences if the model added them despite instructions
# Handles ```mdx ... ```, ```markdown ... ```, or plain ``` ... ```
if echo "$TRANSLATED" | head -1 | grep -qE '^\s*```'; then
    TRANSLATED=$(echo "$TRANSLATED" | sed '1d' | sed '$d')
fi

# ─── Write Output ────────────────────────────────────────────────────────────

# Ensure EN directory exists
mkdir -p "$EN_DIR"

echo "$TRANSLATED" > "$EN_FILE"

# Count words in output
EN_WORDS=$(word_count "$EN_FILE")

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
success "Translation complete!"
echo ""
echo -e "  Source (TH): $TH_FILE"
echo -e "  Target (EN): $EN_FILE"
echo -e "  Words:       $TH_WORDS (TH) → $EN_WORDS (EN)"

# Show stop reason
STOP_REASON=$(echo "$HTTP_BODY" | jq -r '.stop_reason // "unknown"' 2>/dev/null)
if [[ "$STOP_REASON" == "end_turn" ]]; then
    echo -e "  Status:      ${GREEN}Complete${NC}"
elif [[ "$STOP_REASON" == "max_tokens" ]]; then
    echo -e "  Status:      ${YELLOW}Truncated (hit max_tokens=$MAX_TOKENS)${NC}"
    warn "Output may be incomplete. Consider increasing MAX_TOKENS."
else
    echo -e "  Status:      Stop reason: $STOP_REASON"
fi

echo ""
