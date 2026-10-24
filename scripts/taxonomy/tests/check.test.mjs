// BM-18 (tordash/dopelab-oracle#27) · build guard scripts/taxonomy/check.mjs (SPEC S7, §5.1; AC1, AC4).
// Run: node --test scripts/taxonomy/tests/*.test.mjs   (no deps; temp trees under os.tmpdir(), removed with fs.rmSync)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as guard from "../check.mjs";
import { validateTaxonomy as modelValidate } from "../../../src/lib/taxonomy/model.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const CHECK = join(HERE, "..", "check.mjs");
const FIX = join(HERE, "..", "fixtures");
const TAXONOMY = JSON.parse(readFileSync(join(REPO, "src/lib/taxonomy/taxonomy.json"), "utf8"));

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "bm18-check-"));
  for (const [rel, src] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    if (src.startsWith("fixture:")) copyFileSync(join(FIX, src.slice(8)), p);
    else writeFileSync(p, src);
  }
  return root;
}

function run(root, ...extra) {
  const r = spawnSync(process.execPath, [CHECK, "--root", root, ...extra], { encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

const post = (category, tags, draft = "false") =>
  `---\ntitle: "t"\ndate: 2026-10-25\ncategory: "${category}"\ntags: ${JSON.stringify(tags)}\ndraft: ${draft}\n---\n\nbody\n`;

function realShaped() {
  // every visible category in both locales (5 · 5), studio hidden
  const files = {};
  for (const loc of ["th", "en"]) {
    for (const c of ["how-to", "shop", "marketing", "tools", "ai"]) files[`content/posts/${loc}/${c}-post.mdx`] = post(c, ["automation", "sme"]);
  }
  return files;
}

test("AC4 offline half: an old category name fails, naming file + field + value (exit 1)", () => {
  const root = tree({ ...realShaped(), "content/posts/th/bm18-guard-fixture.mdx": "fixture:old-category.mdx" });
  try {
    const { code, out } = run(root);
    assert.equal(code, 1, out);
    assert.match(out, /TAXONOMY FAIL content\/posts\/th\/bm18-guard-fixture\.mdx category "AI News"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unknown tag fails (exit 1)", () => {
  const root = tree({ ...realShaped(), "content/posts/en/x.mdx": "fixture:unknown-tag.mdx" });
  try {
    const { code, out } = run(root);
    assert.equal(code, 1);
    assert.match(out, /TAXONOMY FAIL content\/posts\/en\/x\.mdx tags "not-a-key"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a trailing-comment category line fails (TASKS Δ4: the regex never matches it)", () => {
  const root = tree({ ...realShaped(), "content/posts/th/first-post.mdx": "fixture:trailing-comment.mdx" });
  try {
    const { code, out } = run(root);
    assert.equal(code, 1);
    assert.match(out, /TAXONOMY FAIL content\/posts\/th\/first-post\.mdx category ".*# key how-to/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a multi-line tags: block fails (exactly one inline tags line is required)", () => {
  const root = tree({ ...realShaped(), "content/posts/th/m.mdx": "fixture:multiline-tags.mdx" });
  try {
    const { code, out } = run(root);
    assert.equal(code, 1);
    assert.match(out, /TAXONOMY FAIL content\/posts\/th\/m\.mdx tags/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("more than 5 tags, duplicate tags and 0 tags fail", () => {
  const six = ["automation", "sme", "seo", "crm", "data", "video"];
  const root = tree({
    ...realShaped(),
    "content/posts/th/six.mdx": post("ai", six),
    "content/posts/th/dup.mdx": post("ai", ["sme", "sme"]),
    "content/posts/th/none.mdx": post("ai", []),
  });
  try {
    const { code, out } = run(root);
    assert.equal(code, 1);
    assert.match(out, /six\.mdx tags "6 tags \(max 5\)"/);
    assert.match(out, /dup\.mdx tags "duplicate sme"/);
    assert.match(out, /none\.mdx tags "0 tags"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("real-shaped tree passes; drafts are checked too; studio stays hidden below 3 posts", () => {
  const root = tree({
    ...realShaped(),
    "content/posts/th/fixture-valid.mdx": "fixture:valid-keys.mdx",
    "content/posts/th/s1.mdx": post("studio", ["sme"]),
    "content/posts/th/s2.mdx": post("studio", ["sme"]),
    "content/posts/th/s3.mdx": post("studio", ["sme"], "true"),
  });
  try {
    const { code, out } = run(root);
    assert.equal(code, 0, out);
    assert.match(out, /^taxonomy OK · posts 14 · categories 6 \(visible th 5 · en 5\) · tags 34$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const bad = tree({ ...realShaped(), "content/posts/th/d.mdx": post("AI News", ["sme"], "true") });
  try {
    assert.equal(run(bad).code, 1, "a draft with an old name still fails");
  } finally {
    rmSync(bad, { recursive: true, force: true });
  }
});

test("missing taxonomy file or no posts = tool error (exit 2)", () => {
  const root = tree({ "content/posts/th/a.mdx": post("ai", ["sme"]) });
  try {
    assert.equal(run(root, "--taxonomy", join(root, "nope.json")).code, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const empty = mkdtempSync(join(tmpdir(), "bm18-check-"));
  try {
    assert.equal(run(empty).code, 2);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("the guard's taxonomy rules agree with src/lib/taxonomy/model.ts (no drift between the two copies)", () => {
  const cases = [
    (t) => t,
    (t) => { t.categories[0].key = "How To"; },
    (t) => { t.categories.splice(0, 2); },
    (t) => { t.categories[1].names.th = ""; },
    (t) => { t.categories.find((c) => c.key === "tools").ai_topic = true; },
    (t) => { t.categories.find((c) => c.key === "shop").key = "cases"; },
    (t) => { t.tags = t.tags.slice(0, 19); },
    (t) => { t.tags.push({ key: "SME", names: { th: "x", en: "x" } }); },
    (t) => { t.categories[2].description.en = ""; },
    (t) => { t.categories[3].min_posts = 0; },
  ];
  for (const mutate of cases) {
    const t = structuredClone(TAXONOMY);
    mutate(t);
    assert.deepEqual(guard.validateTaxonomy(t), modelValidate(t));
  }
  assert.deepEqual(guard.validateTaxonomy(TAXONOMY), []);
});
