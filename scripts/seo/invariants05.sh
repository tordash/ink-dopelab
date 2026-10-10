#!/usr/bin/env bash
# BM-05 AC12 (static part) + file ownership (SPEC §5.3). Read-only; no rm; run from anywhere.
#   bash scripts/seo/invariants05.sh
# Env: BASE (default origin/bm/BM-15-static, or origin/bm/r1 once BM-15 is merged into it) ·
#      BM03_DIR (default ~/Projects/dopelab/deliverables/blog-migration: url-rules.json for the drift check)
# One line per check: "<PASS|FAIL> <check> · got <x> · want <y>". Exit 0 = every line PASS.
set -u
export LC_ALL=C
cd "$(dirname "$0")/../.." || exit 2
if [ -z "${BASE:-}" ]; then
  if git merge-base --is-ancestor origin/bm/BM-15-static origin/bm/r1 2>/dev/null; then BASE=origin/bm/r1; else BASE=origin/bm/BM-15-static; fi
fi
BM03_DIR="${BM03_DIR:-$HOME/Projects/dopelab/deliverables/blog-migration}"
MB=$(git merge-base "$BASE" HEAD)
fails=0
check() { # name got want
  if [ "$2" = "$3" ]; then echo "PASS $1 · got $2 · want $3"; else echo "FAIL $1 · got $2 · want $3"; fails=$((fails + 1)); fi
}
count_lines() { grep -c . || true; }
files_of() { sort -u | tr '\n' ' ' | sed 's/ $//'; }

echo "# invariants05.sh (BM-05 AC12 static + ownership) · $(date '+%F %T %z') · repo $(pwd) · HEAD $(git rev-parse --short HEAD) · BASE $BASE=$(git rev-parse --short "$BASE") · merge-base $(git rev-parse --short "$MB")"

# 1. static rendering stays (BM-15): locale from params, no request-time API
check "1a files with setRequestLocale( under src/app" "$(grep -rl 'setRequestLocale(' src/app | count_lines)" "8"
check "1b getLocale in src (lines)" "$(grep -rn 'getLocale' src | count_lines)" "0"
check "1c headers()|cookies()|connection()|draftMode()|unstable_noStore in src (lines)" \
  "$(grep -rnE 'headers\(\)|cookies\(\)|connection\(\)|draftMode\(\)|unstable_noStore' src | count_lines)" "0"
check "1d export const dynamic|dynamicParams|revalidate in src/app (lines)" \
  "$(grep -rnE 'export const (dynamic|dynamicParams|revalidate)' src/app | count_lines)" "0"

# 2. no "/blog literal outside the basePath resolver (BM-04 invariants.sh #7 rule)
check "2 \"/blog literals in src outside src/lib/base-path.ts (lines)" \
  "$(grep -rnE "[\"'\`]/blog" src | grep -v '^src/lib/base-path.ts:' | count_lines)" "0"

# 3. env readers: one resolver per variable (src + next.config.ts = the code that ships)
r1=$(grep -rlE 'process\.env\.(BLOG_NOINDEX|INK_REDIRECT_MODE)' src next.config.ts | files_of)
check "3a files reading process.env.(BLOG_NOINDEX|INK_REDIRECT_MODE)" "${r1:-none}" "src/lib/seo-env.ts"
r2=$(grep -rlE 'process\.env\.NEXT_PUBLIC_SITE_URL' src next.config.ts | files_of)
check "3b files reading process.env.NEXT_PUBLIC_SITE_URL" "${r2:-none}" "src/lib/site.ts"
r3=$(grep -rlE 'process\.env\.(BLOG_BASE_PATH|BLOG_ASSET_PREFIX|VERCEL_ENV)' src next.config.ts | files_of)
check "3c files reading process.env.(BLOG_BASE_PATH|BLOG_ASSET_PREFIX|VERCEL_ENV)" "${r3:-none}" "src/lib/base-path.ts"
check "3d scripts/seo/tests spelling process.env.<one of the 6 names> (lines)" \
  "$(grep -rnE 'process\.env\.(BLOG_NOINDEX|INK_REDIRECT_MODE|NEXT_PUBLIC_SITE_URL|BLOG_BASE_PATH|BLOG_ASSET_PREFIX|VERCEL_ENV)' scripts/seo/tests | count_lines)" "0"

# 4. one URL module: no velite permalink reader; no ink host in BM-05's own src files; server-only modules
OWNED_SRC="src/lib/seo-env.ts src/lib/urls.ts src/lib/site.ts src/lib/seo.ts src/app/[locale]/layout.tsx src/app/[locale]/page.tsx src/app/[locale]/[slug]/page.tsx src/app/[locale]/all/page.tsx src/app/[locale]/about/page.tsx src/app/[locale]/contact/page.tsx src/app/[locale]/tag/[tag]/page.tsx src/app/[locale]/category/[category]/page.tsx src/app/sitemap.ts src/app/robots.ts src/app/feed.xml/route.ts src/app/api/og/route.tsx src/components/layout/footer.tsx src/i18n/routing.ts"
pfiles=$(grep -rl 'permalink' src | files_of)
check "4a files reading velite permalink in src (lines $(grep -rn 'permalink' src | count_lines))" "${pfiles:-none}" "none"
ink=0
for f in $OWNED_SRC; do
  [ -f "$f" ] && ink=$((ink + $(grep -c 'ink\.dopelab\.studio' "$f" || true)))
done
check "4b ink.dopelab.studio lines in BM-05's src files (§3.1+§3.2, legacy-routes.json excluded)" "$ink" "0"
uc=$(grep -rlE '^["'"'"']use client["'"'"']' src | xargs grep -lE '@/lib/(seo|urls|seo-env)["'"'"']|legacy-routes\.json' 2>/dev/null | files_of)
check "4c \"use client\" files importing @/lib/seo|urls|seo-env or legacy-routes.json" "${uc:-none}" "none"

# 5. routing.ts: alternateLinks: false only (+ its comment)
check "5a alternateLinks: false in src/i18n/routing.ts" "$(grep -c 'alternateLinks: false' src/i18n/routing.ts || true)" "1"
rdiff=$(git diff "$MB" -- src/i18n/routing.ts)
check "5b routing.ts lines removed vs BASE" "$(printf '%s\n' "$rdiff" | grep -E '^-[^-]|^-$' | count_lines)" "0"
check "5c routing.ts added lines other than alternateLinks: false + its BM-05 comment" \
  "$(printf '%s\n' "$rdiff" | grep -E '^\+[^+]|^\+$' | grep -vE '^\+\s*alternateLinks: false,\s*$|^\+\s*// BM-05' | count_lines)" "0"

# 6. changed files vs BASE (merge-base; working tree + untracked, public/static excluded) == the SPEC §3.1 + §3.2 list
ALLOW="$OWNED_SRC src/lib/legacy-routes.json next.config.ts .env.example scripts/seo/gen-legacy-routes.mjs scripts/seo/bm05.py scripts/seo/invariants05.sh scripts/checks/no-ink-host.sh scripts/seo/tests/urls.test.mjs scripts/seo/tests/seo-env.test.mjs scripts/seo/tests/site.test.mjs scripts/seo/tests/legacy-routes.test.mjs scripts/seo/tests/fixtures/today.mjs"
changed=$( { git diff --name-only "$MB"; git ls-files --others --exclude-standard; } | grep -v '^public/static/' | sort -u)
allow=$(printf '%s\n' $ALLOW | sort -u)
extra=$(comm -23 <(printf '%s\n' "$changed") <(printf '%s\n' "$allow") | grep . | files_of)
notyet=$(comm -13 <(printf '%s\n' "$changed") <(printf '%s\n' "$allow") | grep . | files_of)
check "6a changed files outside the allowlist" "${extra:-none}" "none"
check "6b allowlisted files not changed yet" "${notyet:-none}" "none"

# 7. the committed legacy map = what url-rules.json generates (drift 0)
gen=$(node scripts/seo/gen-legacy-routes.mjs --rules "$BM03_DIR/data/url-rules.json" --check 2>&1); gexit=$?
echo "# $(printf '%s\n' "$gen" | tail -1)"
check "7 gen-legacy-routes.mjs --check exit (rules $BM03_DIR/data/url-rules.json)" "$gexit" "0"

echo "RESULT $([ "$fails" -eq 0 ] && echo PASS || echo "FAIL ($fails)")"
[ "$fails" -eq 0 ]
