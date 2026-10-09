#!/usr/bin/env bash
# BM-15 AC7: invariants of the static-rendering change (SPEC §5). Read-only; no rm; run from anywhere.
#   bash scripts/migration/static/invariants15.sh
# Env: BASE (default origin/bm/r1). Compares the working tree (committed + uncommitted) with $BASE.
# One line per check: "<PASS|FAIL> <check> · got <x> · want <y>". Exit 0 = every line PASS.
set -u
cd "$(dirname "$0")/../../.." || exit 2
BASE="${BASE:-origin/bm/r1}"
fails=0
check() { # name got want
  if [ "$2" = "$3" ]; then echo "PASS $1 · got $2 · want $3"; else echo "FAIL $1 · got $2 · want $3"; fails=$((fails + 1)); fi
}
count_lines() { grep -c . || true; }

echo "# invariants15.sh (BM-15 AC7) · $(date '+%F %T %z') · repo $(pwd) · HEAD $(git rev-parse --short HEAD) · BASE $BASE=$(git rev-parse --short "$BASE")"

# 1. locale from params: the layout + the 7 pages call setRequestLocale(
check "files in src/app calling setRequestLocale( (layout + 7 pages)" \
  "$(grep -rlF 'setRequestLocale(' src/app | count_lines)" "8"
check "getLocale in src/app (lines)" "$(grep -rn 'getLocale' src/app | count_lines)" "0"

# 2. no dynamic API and no route-segment config (A2/A3: no force-static, no dynamic = "error")
check "headers()/cookies()/connection()/draftMode()/unstable_noStore/revalidate = 0 in src (lines)" \
  "$(grep -rnE 'headers\(\)|cookies\(\)|connection\(\)|draftMode\(\)|unstable_noStore|revalidate *= *0' src | count_lines)" "0"
check "export const dynamic / dynamicParams / revalidate in src/app (lines)" \
  "$(grep -rnE 'export const dynamic|dynamicParams|revalidate' src/app | count_lines)" "0"
check "generateStaticParams lines changed in src/app vs BASE" \
  "$(git diff "$BASE" -U0 -- src/app | grep -E '^[-+][^-+]' | grep -c 'generateStaticParams' || true)" "0"

# 3. routing.ts: only the cookie line (+ its comment) is added
R=src/i18n/routing.ts
check "routing.ts localeCookie: false" "$(grep -c 'localeCookie: false' "$R")" "1"
check "routing.ts locales: [\"th\", \"en\"]" "$(grep -c 'locales: \["th", "en"\]' "$R")" "1"
check "routing.ts defaultLocale: \"th\"" "$(grep -c 'defaultLocale: "th"' "$R")" "1"
check "routing.ts localeDetection: false" "$(grep -c 'localeDetection: false' "$R")" "1"
check "routing.ts localePrefix: \"as-needed\"" "$(grep -c 'localePrefix: "as-needed"' "$R")" "1"
check "routing.ts alternateLinks: false" "$(grep -c 'alternateLinks: false' "$R")" "0"
check "routing.ts lines removed vs BASE" "$(git diff "$BASE" -U0 -- "$R" | grep -E '^-' | grep -vc '^---' || true)" "0"
check "routing.ts lines added vs BASE other than localeCookie: false and its // BM-15 comment" \
  "$(git diff "$BASE" -U0 -- "$R" | grep -E '^\+' | grep -v '^+++' | grep -vE '^\+ *localeCookie: false,$|^\+ *// BM-15' | count_lines)" "0"

# 4. files that must not change (SPEC §3 "Not changed")
ac7="src/middleware.ts next.config.ts src/lib/base-path.ts package.json package-lock.json src/lib/content.ts src/lib/seo.ts src/lib/site.ts src/app/sitemap.ts src/app/robots.ts src/app/feed.xml src/app/api velite.config.ts src/lib/prune scripts/migration/checks src/app/not-found.tsx"
check "git diff BASE -- middleware/next.config/base-path/package*/content/seo/site/sitemap/robots/feed/api/velite/prune/checks/not-found (lines)" \
  "$(git diff "$BASE" -- $ac7 | count_lines)" "0"
check "git diff BASE --stat -- *.css messages src/components (lines)" \
  "$(git diff "$BASE" --stat -- '*.css' messages src/components | count_lines)" "0"

# 5. X4 asset-host call sites: per-file counts equal to BASE
pat='withAssetHost\(|publicAssetSrc\(|withAssetHostMdxRuntime\('
head_c=$(git grep -cE "$pat" -- src | sort)
base_c=$(git grep -cE "$pat" "$BASE" -- src | sed "s|^$BASE:||" | sort)
check "per-file withAssetHost(/publicAssetSrc(/withAssetHostMdxRuntime( counts vs BASE ($(printf '%s\n' "$head_c" | count_lines) files)" \
  "$([ "$head_c" = "$base_c" ] && echo equal || echo different)" "equal"

# 6. changed-file allowlist: the 9 files of SPEC §3 + scripts/migration/static/* (velite output public/static excluded)
allow='^(src/i18n/routing\.ts|src/app/\[locale\]/layout\.tsx|src/app/\[locale\]/page\.tsx|src/app/\[locale\]/\[slug\]/page\.tsx|src/app/\[locale\]/(about|all|contact)/page\.tsx|src/app/\[locale\]/tag/\[tag\]/page\.tsx|src/app/\[locale\]/category/\[category\]/page\.tsx|scripts/migration/static/[^/]+)$'
changed=$( { git diff --name-only "$BASE"; git ls-files --others --exclude-standard -- . ':!public/static'; } | sort -u)
outside=$(printf '%s\n' "$changed" | grep -vE "$allow" | grep . || true)
echo "# changed vs BASE ($(printf '%s\n' "$changed" | count_lines)): $(printf '%s\n' "$changed" | tr '\n' ' ')"
check "changed files outside the allowlist" "$(printf '%s\n' "$outside" | count_lines)" "0"
[ -n "$outside" ] && echo "# outside: $(printf '%s\n' "$outside" | tr '\n' ' ')"

echo "RESULT $([ "$fails" -eq 0 ] && echo PASS || echo "FAIL ($fails)")"
[ "$fails" -eq 0 ]
