#!/usr/bin/env bash
# BM-04 AC9: invariants that must not move (SPEC §8.5 + TASKS X4-e). Read-only; no rm; run from anywhere.
#   bash scripts/migration/checks/invariants.sh
# Env: B0_URL (default http://localhost:4410) · B1_URL (default http://localhost:4420) · BASE (default origin/bm/r1)
# One line per check: "<PASS|FAIL> <check> · got <x> · want <y>". Exit 0 = every line PASS.
set -u
cd "$(dirname "$0")/../../.." || exit 2
B0_URL="${B0_URL:-http://localhost:4410}"
B1_URL="${B1_URL:-http://localhost:4420}"
BASE="${BASE:-origin/bm/r1}"
fails=0
check() { # name got want
  if [ "$2" = "$3" ]; then echo "PASS $1 · got $2 · want $3"; else echo "FAIL $1 · got $2 · want $3"; fails=$((fails + 1)); fi
}
count_lines() { grep -c . || true; }

echo "# invariants.sh (AC9) · $(date '+%F %T %z') · repo $(pwd) · HEAD $(git rev-parse --short HEAD) · BASE $BASE=$(git rev-parse --short "$BASE")"

# 1. GA id in the rendered <head>: same count on B0 and B1 for the 8 AC2(d) pages
pairs="/th:/blog /th/blog:/blog/all /th/blog/90-percent-business-from-phone:/blog/90-percent-business-from-phone /th/blog/tag/ai:/blog/tag/ai /en:/blog/en /en/blog/agent-teams-11-ai:/blog/en/agent-teams-11-ai /th/about:/blog/about /en/contact:/blog/en/contact"
for pr in $pairs; do
  b0="${pr%%:*}"; b1="${pr##*:}"
  g0=$(curl -s "$B0_URL$b0" | sed -n '1,/<\/head>/p' | grep -o 'G-SVY8Q547WJ' | count_lines)
  g1=$(curl -s "$B1_URL$b1" | sed -n '1,/<\/head>/p' | grep -o 'G-SVY8Q547WJ' | count_lines)
  check "GA G-SVY8Q547WJ in <head> $b0 (B0) vs $b1 (B1)" "$g1" "$g0"
done

# 2. files that must not change vs the epic base
check "git diff $BASE -- post-cta.tsx comments.tsx content.ts (lines)" \
  "$(git diff "$BASE" -- src/components/blog/post-cta.tsx src/components/blog/comments.tsx src/lib/content.ts | count_lines)" "0"
check "utm_source=ink in post-cta.tsx" "$(grep -c 'utm_source: "ink"' src/components/blog/post-cta.tsx)" "1"
check "utm_medium=post_cta in post-cta.tsx" "$(grep -c 'utm_medium: "post_cta"' src/components/blog/post-cta.tsx)" "1"

# 3. look/behaviour switches
check "Newsletter still commented in [slug]/page.tsx" "$(grep -c '{/\* <Newsletter /> \*/}' 'src/app/[locale]/[slug]/page.tsx')" "1"
check 'defaultTheme="light" in src' "$(grep -rn 'defaultTheme="light"' src | count_lines)" "1"
check 'giscus mapping="pathname" in src' "$(grep -rn 'mapping="pathname"' src | count_lines)" "1"

# 4. no new dynamic APIs in src/app (BM-15 static rendering must not get harder)
dyn_pat='cookies\(\)|headers\(\)|export const dynamic'
dyn_base=$(git grep -nE "$dyn_pat" "$BASE" -- src/app | count_lines)
dyn_head=$(grep -rnE "$dyn_pat" src/app | count_lines)
check "cookies()/headers()/export const dynamic in src/app (branch vs base)" "$dyn_head" "$dyn_base"

# 5. dependencies untouched
check "git diff $BASE -- package-lock.json (lines)" "$(git diff "$BASE" -- package-lock.json | count_lines)" "0"
pkg=$(git diff "$BASE" -- package.json | grep -E '^[-+] ' | grep -vc '"build":' || true)
check "package.json changed lines other than \"build\"" "$pkg" "0"
check "package.json \"build\" lines changed (- and +)" "$(git diff "$BASE" -- package.json | grep -E '^[-+] ' | grep -c '"build":' || true)" "2"

# 6. env reads: the resolver is the only reader (AC9 + X4-e)
readers=$(grep -rlE 'process\.env\.(BLOG_BASE_PATH|BLOG_ASSET_PREFIX|VERCEL_ENV)' src next.config.ts velite.config.ts scripts | sort | tr '\n' ' ' | sed 's/ $//')
check "files reading process.env.(BLOG_BASE_PATH|BLOG_ASSET_PREFIX|VERCEL_ENV)" "${readers:-none}" "src/lib/base-path.ts"

# 7. no "/blog" literal outside the resolver
check "\"/blog literals in src outside src/lib/base-path.ts" \
  "$(grep -rnE "[\"'\`]/blog" src | grep -v '^src/lib/base-path.ts:' | count_lines)" "0"

echo "RESULT $([ "$fails" -eq 0 ] && echo PASS || echo "FAIL ($fails)")"
[ "$fails" -eq 0 ]
