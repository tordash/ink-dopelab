#!/usr/bin/env bash
# BM-05 AC11 (SPEC §5.4): the legacy ink host must not appear in what the build serves.
#   bash scripts/checks/no-ink-host.sh <build dir> <server url>
#     (a) every *.html, *.rsc, *.meta, *.body file and every file under *.segments/ in <build dir>/.next/server/app
#         (JS chunks are excluded: the mode-off legacy origin legitimately lives in server chunks)
#     (b) every file under <build dir>/.next/static (client bundles: the URL module is server-only, S-2)
#     (c) the HTTP bodies of /blog/sitemap.xml, /blog/feed.xml, /blog/robots.txt + the 3 on-demand URLs
# Prints "file<TAB>lines" for every hit, the totals per part, then RESULT PASS (exit 0) iff (a) + (b) + (c) = 0.
# Counts matching lines (grep -c). grep / find / curl only; no rm, no temp files.
set -u
DIR="${1:?usage: no-ink-host.sh <build dir> <server url>}"
URL="${2:?usage: no-ink-host.sh <build dir> <server url>}"
URL="${URL%/}"
HOST='ink.dopelab.studio'
APP="$DIR/.next/server/app"
STATIC="$DIR/.next/static"
[ -d "$APP" ] || { echo "no $APP"; exit 2; }

echo "# no-ink-host.sh · $(date '+%F %T %z') · build $DIR (BUILD_ID $(cat "$DIR/.next/BUILD_ID" 2>/dev/null)) · server $URL · pattern $HOST"

hits() { # reads "file:count" lines (grep -c output), prints "file<TAB>count" for count > 0, returns the sum via stdout tail
  awk -F: '{ c = $NF; sub(/:[0-9]+$/, ""); if (c > 0) { printf "%s\t%d\n", $0, c; n++; s += c } } END { printf "#sum\t%d\t%d\n", n + 0, s + 0 }'
}

echo "## (a) $APP: *.html *.rsc *.meta *.body + *.segments/*"
a_files=$(find "$APP" -type f \( -name '*.html' -o -name '*.rsc' -o -name '*.meta' -o -name '*.body' -o -path '*.segments/*' \) | grep -c . || true)
a_out=$(find "$APP" -type f \( -name '*.html' -o -name '*.rsc' -o -name '*.meta' -o -name '*.body' -o -path '*.segments/*' \) -exec grep -c -F -H "$HOST" {} + | hits)
printf '%s\n' "$a_out" | grep -v '^#sum'
a_n=$(printf '%s\n' "$a_out" | awk -F'\t' '/^#sum/ {print $2}')
a_s=$(printf '%s\n' "$a_out" | awk -F'\t' '/^#sum/ {print $3}')
a_html=$(printf '%s\n' "$a_out" | grep -v '^#sum' | awk -F'\t' '$1 ~ /\.html$/' | grep -c . || true)
echo "(a) files scanned $a_files · files with the host $a_n (html $a_html) · lines $a_s"

echo "## (b) $STATIC (client bundles, all files)"
if [ -d "$STATIC" ]; then
  b_files=$(find "$STATIC" -type f | grep -c . || true)
  b_out=$(find "$STATIC" -type f -exec grep -c -F -H "$HOST" {} + | hits)
else
  b_files=0; b_out=$(printf '#sum\t0\t0\n')
fi
printf '%s\n' "$b_out" | grep -v '^#sum'
b_n=$(printf '%s\n' "$b_out" | awk -F'\t' '/^#sum/ {print $2}')
b_s=$(printf '%s\n' "$b_out" | awk -F'\t' '/^#sum/ {print $3}')
echo "(b) files scanned $b_files · files with the host $b_n · lines $b_s"

echo "## (c) HTTP bodies from $URL"
c_s=0
for p in /blog/sitemap.xml /blog/feed.xml /blog/robots.txt /blog/zzz-not-a-post-bm05 /blog/tag/zzz-not-a-tag-bm05 /blog/th/th; do
  n=$(curl -s "$URL$p" | grep -c -F "$HOST" || true)
  [ "$n" -gt 0 ] && printf '%s\t%d\n' "$URL$p" "$n"
  c_s=$((c_s + n))
done
echo "(c) bodies 6 · lines $c_s"

total=$((a_s + b_s + c_s))
echo "TOTAL (a) $a_s + (b) $b_s + (c) $c_s = $total"
echo "RESULT $([ "$total" -eq 0 ] && echo PASS || echo FAIL)"
[ "$total" -eq 0 ]
