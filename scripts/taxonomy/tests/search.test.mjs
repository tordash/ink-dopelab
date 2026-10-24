// BM-18 (tordash/dopelab-oracle#27) · review F1: every Fuse search index holds display NAMES, never keys (SPEC S13, AC7).
// Two indexes exist: the header search (search-provider.tsx → SearchButton) and the /all in-page search
// (blog-content.tsx → SearchPosts). Both must build their category/tag fields through searchFields().
// Run: node --test scripts/taxonomy/tests/*.test.mjs   (no deps: fuse.js is not loaded; a plain substring match
// stands in for "the Thai query can hit the category/tag field at all")
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchFields } from "../../../src/lib/taxonomy/model.ts";

const T = JSON.parse(readFileSync(new URL("../../../src/lib/taxonomy/taxonomy.json", import.meta.url), "utf8"));
const src = (rel) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

test("searchFields: keys → th names (users type Thai)", () => {
  assert.deepEqual(searchFields(T, "how-to", ["marketing", "sme", "automation"], "th"), {
    category: "วิธีทำ",
    tags: ["การตลาด", "ธุรกิจ SME", "ระบบอัตโนมัติ"],
  });
  assert.deepEqual(searchFields(T, "shop", [], "th"), { category: "เคสร้านจริง", tags: [] });
});

test("searchFields: keys → en names", () => {
  assert.deepEqual(searchFields(T, "how-to", ["marketing", "sme"], "en"), {
    category: "How-to",
    tags: ["Marketing", "Small business"],
  });
});

test("searchFields: an unknown key stays itself (never throws)", () => {
  assert.deepEqual(searchFields(T, "AI News", ["not-a-key"], "th"), { category: "AI News", tags: ["not-a-key"] });
});

test("Thai queries hit the category/tag fields once names are indexed (they missed on keys)", () => {
  const posts = [
    { slug: "a", category: "how-to", tags: ["automation"] },
    { slug: "b", category: "shop", tags: ["marketing"] },
    { slug: "c", category: "ai", tags: ["claude-code"] },
  ];
  const hits = (items, q) => items.filter((p) => p.category.includes(q) || p.tags.some((t) => t.includes(q))).map((p) => p.slug);
  const byKey = posts;
  const byName = posts.map((p) => ({ slug: p.slug, ...searchFields(T, p.category, p.tags, "th") }));
  for (const [q, want] of [["วิธีทำ", ["a"]], ["เคสร้านจริง", ["b"]], ["การตลาด", ["b"]], ["ระบบอัตโนมัติ", ["a"]]]) {
    assert.deepEqual(hits(byKey, q), [], `keys must not match ${q} (the F1 bug)`);
    assert.deepEqual(hits(byName, q), want, q);
  }
});

// Wiring: the two .tsx call sites can't be imported by node --test (JSX + the @/ alias), so assert their source.
test("both Fuse indexes are fed through searchNames (no raw p.category / p.tags into a search item)", () => {
  const blog = src("src/components/blog/blog-content.tsx");
  const m = blog.match(/<SearchPosts[\s\S]*?onFilter=/);
  assert.ok(m, "SearchPosts call found in blog-content.tsx");
  assert.match(m[0], /searchNames\(p\.category, p\.tags, loc\)/);
  assert.doesNotMatch(m[0], /category:\s*p\.category\b|tags:\s*p\.tags\b/);

  const header = src("src/components/layout/search-provider.tsx");
  assert.match(header, /searchNames\(post\.category, post\.tags, locale\)/);
  assert.doesNotMatch(header, /category:\s*post\.category\b|tags:\s*post\.tags\b/);

  const index = src("src/lib/taxonomy/index.ts");
  assert.match(index, /export const searchNames = [^\n]*searchFields\(taxonomy,/);
});
