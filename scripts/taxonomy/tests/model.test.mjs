// BM-18 (tordash/dopelab-oracle#27) · taxonomy model: AC1 rules, names, visibility (SPEC S1–S3, §8.1a ink).
// Run: node --test scripts/taxonomy/tests/*.test.mjs   (Node strips the erasable TS of model.ts; no deps)
// taxonomy.json is read with fs on purpose: the test must not depend on bundler-only JSON import syntax.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KEY_RE, validateTaxonomy, nameOf, visible, aiShare } from "../../../src/lib/taxonomy/model.ts";

const T = JSON.parse(readFileSync(new URL("../../../src/lib/taxonomy/taxonomy.json", import.meta.url), "utf8"));
const clone = () => structuredClone(T);
const cat = (t, key) => t.categories.find((c) => c.key === key);

test("the shipped taxonomy.json passes every AC1 rule", () => {
  assert.deepEqual(validateTaxonomy(T), []);
  assert.equal(T.version, 1);
  assert.equal(T.categories.length, 6);
  assert.equal(T.tags.length, 34);
});

test("category keys in D2 order", () => {
  assert.deepEqual(T.categories.map((c) => c.key), ["how-to", "shop", "marketing", "tools", "ai", "studio"]);
});

// AC9 names oracle: set ก verbatim — ต่อ "1ก 2ก", Discord 1563586421053198407 (24 Oct 2026 23:14).
test("names = set ก verbatim (Discord 1563586421053198407)", () => {
  const pairs = {
    "how-to": ["วิธีทำ", "How-to"],
    shop: ["เคสร้านจริง", "Shop cases"],
    marketing: ["การตลาดออนไลน์", "Online marketing"],
    tools: ["เครื่องมือช่วยงาน", "Tools"],
    ai: ["AI ในงานจริง", "AI at work"],
  };
  for (const [key, [th, en]] of Object.entries(pairs)) {
    assert.equal(cat(T, key).names.th, th, key);
    assert.equal(cat(T, key).names.en, en, key);
  }
});

test("studio = placeholder name, min_posts 3, hidden today", () => {
  const s = cat(T, "studio");
  assert.equal(s.min_posts, 3);
  assert.equal(s.names.th, "ผลงานถ่ายร้านของ DopeLab");
  assert.equal(s.names.en, "DopeLab studio work");
  assert.equal(visible(s, 0), false);
  assert.equal(visible(s, 2), false);
  assert.equal(visible(s, 3), true);
});

test("exactly 1 ai_topic (ai) and share ≤ 20 %", () => {
  assert.deepEqual(T.categories.filter((c) => c.ai_topic === true).map((c) => c.key), ["ai"]);
  assert.ok(aiShare(T) <= 0.2);
  assert.equal(Math.round(aiShare(T) * 100), 17);
});

test("public descriptions never carry internal strategy wording", () => {
  for (const c of T.categories) {
    for (const s of [c.description.th, c.description.en, c.role]) {
      assert.doesNotMatch(s, /ทำไมเราเร็ว|ai_topic|mix|สัดส่วน/i, c.key);
    }
  }
});

test("visible() honours min_posts (default 1)", () => {
  assert.equal(visible({ key: "x" }, 0), false);
  assert.equal(visible({ key: "x" }, 1), true);
  assert.equal(visible({ key: "x", min_posts: 2 }, 1), false);
});

test("nameOf: known key → name · unknown key → the key itself, never throws", () => {
  assert.equal(nameOf(T.categories, "how-to", "th"), "วิธีทำ");
  assert.equal(nameOf(T.categories, "how-to", "en"), "How-to");
  assert.equal(nameOf(T.tags, "claude-code", "th"), "Claude Code");
  assert.equal(nameOf(T.tags, "sme", "en"), "Small business");
  assert.equal(nameOf(T.categories, "AI News", "th"), "AI News");
  assert.equal(nameOf(T.tags, "", "en"), "");
});

test("KEY_RE", () => {
  for (const ok of ["ai", "how-to", "e-commerce", "a1-b2"]) assert.match(ok, KEY_RE);
  for (const bad of ["AI", "how_to", "-ai", "ai-", "a--b", "การตลาด", "a b", ""]) assert.doesNotMatch(bad, KEY_RE);
});

// one negative case per AC1 rule
const NEG = [
  ["category key regex", (t) => { t.categories[0].key = "How To"; }, /key/],
  ["category count 5–7", (t) => { t.categories.splice(0, 2); }, /categories/],
  ["empty th name", (t) => { t.categories[1].names.th = " "; }, /name/],
  ["empty en name (tag)", (t) => { t.tags[3].names.en = ""; }, /name/],
  ["empty description", (t) => { t.categories[2].description.en = ""; }, /description/],
  ["empty role", (t) => { t.categories[2].role = ""; }, /role/],
  ["two ai_topic keys", (t) => { cat(t, "tools").ai_topic = true; }, /ai_topic/],
  ["ai share > 20 %", (t) => { t.categories = t.categories.filter((c) => c.key !== "studio" && c.key !== "tools"); }, /share|categories/],
  ["roles must include shop", (t) => { cat(t, "shop").key = "cases"; }, /shop/],
  ["roles must include how-to", (t) => { cat(t, "how-to").key = "guides"; }, /how-to/],
  ["tags < 20", (t) => { t.tags = t.tags.slice(0, 19); }, /tags/],
  ["tags > 60", (t) => { for (let i = 0; i < 27; i++) t.tags.push({ key: `extra-${i}`, names: { th: "x", en: "x" } }); }, /tags/],
  ["casefold duplicate tag", (t) => { t.tags.push({ key: "SME", names: { th: "x", en: "x" } }); }, /casefold|key/],
  ["duplicate key", (t) => { t.tags.push({ key: "sme", names: { th: "x", en: "x" } }); }, /duplicate|casefold/],
  ["bad min_posts", (t) => { cat(t, "shop").min_posts = 0; }, /min_posts/],
];
for (const [name, mutate, re] of NEG) {
  test(`AC1 negative: ${name}`, () => {
    const t = clone();
    mutate(t);
    const errs = validateTaxonomy(t);
    assert.ok(errs.length > 0, `expected an error for ${name}`);
    assert.ok(errs.some((e) => re.test(e)), `${name}: ${JSON.stringify(errs)}`);
  });
}
