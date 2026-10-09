// BM-04 AC6 (unit): route helpers + locale-switch counterpart (SPEC §5.5–5.6, §8.2).
// Run: node --test scripts/migration/tests/   (Node strips the erasable TS types of src/lib/routes.ts; no deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROUTES, postPath, tagPath, categoryPath, counterpartPath, safeDecode } from "../../../src/lib/routes.ts";

const THAI = "การตลาด";
const THAI_ENC = encodeURIComponent(THAI); // %E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%95%E0%B8%A5%E0%B8%B2%E0%B8%94

// shared = values that exist in BOTH locales (shape of getSharedSwitchIndex()); A/B-test and the Thai tag are th-only.
const shared = {
  posts: ["agent-teams-11-ai"],
  tags: ["karpathy", "AI Agents"],
  categories: ["AI News"],
};
// same, but with A/B-test shared, to prove both pathname encodings resolve to the one encoded tag path
const sharedAB = { ...shared, tags: [...shared.tags, "A/B-test", THAI] };

test("path helpers keep today's encoding (REQ F11)", () => {
  assert.equal(ROUTES.home, "/");
  assert.equal(ROUTES.list, "/all");
  assert.equal(postPath("agent-teams-11-ai"), "/agent-teams-11-ai");
  assert.equal(tagPath("A/B-test"), "/tag/A%2FB-test");
  assert.equal(tagPath("Kling 3.0"), "/tag/Kling%203.0");
  assert.equal(tagPath(THAI), `/tag/${THAI_ENC}`);
  assert.equal(categoryPath("AI News"), "/category/AI%20News");
});

test("safeDecode keeps raw input when it cannot decode", () => {
  assert.equal(safeDecode("A%2FB-test"), "A/B-test");
  assert.equal(safeDecode("%E0%B8"), "%E0%B8");
  assert.equal(safeDecode("100%"), "100%");
});

test("pages that exist in both locales keep their path", () => {
  for (const p of ["/", "/all", "/about", "/contact"]) assert.equal(counterpartPath(p, shared), p);
  assert.equal(counterpartPath("/all/", shared), "/all");
  assert.equal(counterpartPath("", shared), "/");
});

test("posts: paired post keeps its slug, single-locale post goes home", () => {
  assert.equal(counterpartPath("/agent-teams-11-ai", shared), "/agent-teams-11-ai");
  assert.equal(counterpartPath("/agent-teams-11-ai/", shared), "/agent-teams-11-ai");
  assert.equal(counterpartPath("/anthropic-ipo-350b", shared), "/");
});

test("tags: shared tag kept (encoded), th-only tag → home, both pathname encodings", () => {
  assert.equal(counterpartPath("/tag/karpathy", shared), "/tag/karpathy");
  assert.equal(counterpartPath("/tag/AI%20Agents", shared), "/tag/AI%20Agents");
  assert.equal(counterpartPath("/tag/AI Agents", shared), "/tag/AI%20Agents");
  assert.equal(counterpartPath("/tag/A%2FB-test", shared), "/");
  assert.equal(counterpartPath("/tag/A/B-test", shared), "/");
  assert.equal(counterpartPath(`/tag/${THAI_ENC}`, shared), "/");
  assert.equal(counterpartPath(`/tag/${THAI}`, shared), "/");
  // when shared, both encodings of the pathname resolve to the one encoded tag path
  assert.equal(counterpartPath("/tag/A%2FB-test", sharedAB), "/tag/A%2FB-test");
  assert.equal(counterpartPath("/tag/A/B-test", sharedAB), "/tag/A%2FB-test");
  assert.equal(counterpartPath(`/tag/${THAI}`, sharedAB), `/tag/${THAI_ENC}`);
  assert.equal(counterpartPath(`/tag/${THAI_ENC}`, sharedAB), `/tag/${THAI_ENC}`);
});

test("categories: shared kept, unknown → home", () => {
  assert.equal(counterpartPath("/category/AI%20News", shared), "/category/AI%20News");
  assert.equal(counterpartPath("/category/AI News", shared), "/category/AI%20News");
  assert.equal(counterpartPath("/category/Nope", shared), "/");
});

test("anything else → home", () => {
  assert.equal(counterpartPath("/x/y/z", shared), "/");
  assert.equal(counterpartPath("/tag", shared), "/");
  assert.equal(counterpartPath("/tag/", shared), "/");
  assert.equal(counterpartPath("/category/", shared), "/");
});
