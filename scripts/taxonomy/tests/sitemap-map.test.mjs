// BM-18 (tordash/dopelab-oracle#27) · review F7: `routes.py sitemap` (BM-04 AC7) and `ac2_html.py` fetch the 728
// `new_path` rows of scripts/migration/checks/data/sitemap-map-mode-i.tsv on B1 and require 200 on every row.
// After BM-18 the old-name taxonomy pages are notFound() (S8), so each taxonomy row must carry its url-rules 2.0.0
// mode-i destination (X-TAX: the key page, or the majority category for a retired tag), never an old-name path.
// Offline oracle = the same live-page sets as contract.test.mjs (content frontmatter + getAllTags/getAllCategories).
// Run: node --test scripts/taxonomy/tests/*.test.mjs   (no deps; no build, no server)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { checkPost } from "../check.mjs";

const ROOT = new URL("../../../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), "utf8");
const T = JSON.parse(read("src/lib/taxonomy/taxonomy.json"));
const CAT = new Set(T.categories.map((c) => c.key));
const TAG = new Set(T.tags.map((t) => t.key));

function live(loc) {
  const dir = new URL(`content/posts/${loc}/`, ROOT);
  const counts = new Map();
  const tags = new Set();
  const posts = new Set();
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".mdx"))) {
    const r = checkPost(readFileSync(new URL(f, dir), "utf8"), CAT, TAG);
    if (r.draft || !r.category) continue;
    posts.add(f.replace(/\.mdx$/, ""));
    counts.set(r.category, (counts.get(r.category) || 0) + 1);
    for (const t of r.tags || []) tags.add(t);
  }
  const cats = new Set(T.categories.filter((c) => (counts.get(c.key) || 0) >= (c.min_posts ?? 1)).map((c) => c.key));
  return { category: cats, tag: tags, posts };
}
const LIVE = { th: live("th"), en: live("en") };

const TAX = /^\/blog(\/en)?\/(tag|category)\/([^/?#]+)$/;
function tax(path) {
  const m = TAX.exec(path);
  return m ? { loc: m[1] ? "en" : "th", kind: m[2], value: decodeURIComponent(m[3]) } : null;
}
const isLive = (p) => LIVE[p.loc][p.kind].has(p.value);
// old ink URL → {loc, kind} of its taxonomy family (https://ink.dopelab.studio/<loc>/blog/<kind>/<value>)
const OLD_TAX = /^https:\/\/ink\.dopelab\.studio\/(th|en)\/blog\/(tag|category)\/[^/?#]+\/?$/;

const rows = read("scripts/migration/checks/data/sitemap-map-mode-i.tsv")
  .trim().split("\n").slice(1).map((l) => l.split("\t"))
  .map(([old_url, family, rule_id, new_path]) => ({ old_url, family, rule_id, new_path }));
const taxRows = rows.filter((r) => OLD_TAX.test(r.old_url));

test("sitemap map: 728 rows, the 4 header columns, and the non-taxonomy families unchanged (151 posts · 2 · 2 · 4)", () => {
  assert.equal(read("scripts/migration/checks/data/sitemap-map-mode-i.tsv").split("\n")[0], "old_url\tfamily\trule_id\tnew_path");
  assert.equal(rows.length, 728);
  assert.equal(taxRows.length, 569, "old taxonomy URLs in the 2026-10-06 sitemap (42 category + 527 tag)");
  const fam = {};
  for (const r of rows.filter((x) => !OLD_TAX.test(x.old_url))) fam[r.family] = (fam[r.family] || 0) + 1;
  assert.deepEqual(fam, { "R-HOME": 2, "R-LIST": 2, "R-PAGE": 4, "R-POST": 151 });
});

test("sitemap map: every taxonomy row's new_path is a live key page in the same locale (no old-name path left)", () => {
  const bad = [];
  for (const r of taxRows) {
    const [, oloc, okind] = OLD_TAX.exec(r.old_url);
    const p = tax(r.new_path);
    if (!p) { bad.push(`${r.old_url} → ${r.new_path} (not a taxonomy page)`); continue; }
    if (p.loc !== oloc) bad.push(`${r.old_url} → ${r.new_path} (locale ${oloc} → ${p.loc})`);
    else if (!isLive(p)) bad.push(`${r.old_url} → ${r.new_path} (no ${p.loc} ${p.kind} page "${p.value}")`);
    // a category never lands on a tag page; a tag lands on its key's tag page or (retired) on a category page
    else if (okind === "category" && p.kind !== "category") bad.push(`${r.old_url} → ${r.new_path} (category → tag)`);
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} taxonomy rows do not land on a live key page`);
});

test("sitemap map: every R-POST row's new_path is a live post in its locale", () => {
  for (const r of rows.filter((x) => x.family === "R-POST")) {
    const m = /^\/blog(\/en)?\/([^/]+)$/.exec(r.new_path);
    assert.ok(m, r.new_path);
    assert.ok(LIVE[m[1] ? "en" : "th"].posts.has(m[2]), `${r.new_path} is not a live post`);
  }
});
