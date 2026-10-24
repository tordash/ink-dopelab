// BM-18 (tordash/dopelab-oracle#27) · scripts/taxonomy/apply.mjs: 2 frontmatter lines per post + ledger revert
// (SPEC S6, §6.2; AC3). Run: node --test scripts/taxonomy/tests/*.test.mjs   (temp trees under os.tmpdir())
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APPLY = join(HERE, "..", "apply.mjs");
const FIX = join(HERE, "..", "fixtures");

const MAP = {
  version: "1",
  source: { ink_ref: "test" },
  categories: { "AI News": "ai", "AI Workflow": "ai", Tutorial: "how-to" },
  tags: {
    "claude-code": "claude-code", anthropic: "claude", automation: "automation", productivity: "productivity",
    sme: "sme", agency: "agency", seo: "seo", karpathy: null, "Claude Code": "claude-code",
  },
  overrides: { "th/override-target": { category: "shop", tags: ["sme"] } },
  max_tags: 5,
  category_order: ["how-to", "shop", "marketing", "tools", "ai", "studio"],
  min_posts: { "how-to": 1, shop: 1, marketing: 1, tools: 1, ai: 1, studio: 3 },
};

function setup(names, map = MAP) {
  const root = mkdtempSync(join(tmpdir(), "bm18-apply-"));
  for (const n of names) {
    const [loc, file] = n.includes("/") ? n.split("/") : ["th", n];
    mkdirSync(join(root, "content", "posts", loc), { recursive: true });
    copyFileSync(join(FIX, file), join(root, "content", "posts", loc, file));
  }
  const mapPath = join(root, "map.json");
  writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");
  return { root, mapPath, ledger: join(root, "ledger.json") };
}

function snapshot(root) {
  const out = {};
  for (const loc of ["th", "en"]) {
    const d = join(root, "content", "posts", loc);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).sort()) out[`${loc}/${f}`] = readFileSync(join(d, f));
  }
  return out;
}

const body = (buf) => {
  const s = buf.toString("utf8");
  const end = s.indexOf("\n---\n", 4);
  return s.slice(end + 5);
};

function apply(t, ...extra) {
  const r = spawnSync(process.execPath, [APPLY, "--root", t.root, "--map", t.mapPath, "--ledger", t.ledger, ...extra], { encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

function revert(t) {
  const r = spawnSync(process.execPath, [APPLY, "--root", t.root, "--revert", "--ledger", t.ledger], { encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

const fm = (buf, key) => buf.toString("utf8").split("\n").find((l) => l.startsWith(`${key}:`));

test("apply rewrites exactly the 2 lines, keeps every body byte, then revert is byte-identical", () => {
  const t = setup(["old-category.mdx", "six-tags.mdx", "override-target.mdx", "en/old-category.mdx"]);
  try {
    const before = snapshot(t.root);
    const a = apply(t);
    assert.equal(a.code, 0, a.out);
    assert.match(a.out, /applied 4 · already 0 · overrides 1 · capped 1 · body-diff 0/);
    const after = snapshot(t.root);
    for (const k of Object.keys(before)) {
      assert.equal(body(after[k]), body(before[k]), `${k} body bytes`);
      const b = before[k].toString("utf8").split("\n");
      const c = after[k].toString("utf8").split("\n");
      assert.equal(b.length, c.length);
      const changed = b.map((l, i) => (l === c[i] ? null : l)).filter(Boolean);
      assert.ok(changed.every((l) => /^(category|tags): /.test(l)), `${k}: only category/tags lines change`);
    }
    assert.equal(fm(after["th/old-category.mdx"], "category"), 'category: "ai"');
    assert.equal(fm(after["th/old-category.mdx"], "tags"), 'tags: ["claude-code"]');
    const r = revert(t);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /reverted 4/);
    assert.deepEqual(snapshot(t.root), before);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("idempotent: a second apply changes nothing (applied 0 · already n) and keeps the first ledger", () => {
  const t = setup(["old-category.mdx", "six-tags.mdx"]);
  try {
    assert.equal(apply(t).code, 0);
    const once = snapshot(t.root);
    const ledger = readFileSync(t.ledger, "utf8");
    const a = apply(t);
    assert.equal(a.code, 0, a.out);
    assert.match(a.out, /applied 0 · already 2 · overrides 0 · capped 0/);
    assert.deepEqual(snapshot(t.root), once);
    assert.equal(readFileSync(t.ledger, "utf8"), ledger);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("cap 5 keeps the first 5 mapped keys in the post's original order (deduplicated)", () => {
  const t = setup(["six-tags.mdx"]);
  try {
    assert.equal(apply(t).code, 0);
    const s = snapshot(t.root)["th/six-tags.mdx"];
    assert.equal(fm(s, "tags"), 'tags: ["claude-code", "claude", "automation", "productivity", "sme"]');
    assert.equal(fm(s, "category"), 'category: "ai"');
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("override replaces the category and the whole tag list", () => {
  const t = setup(["override-target.mdx"]);
  try {
    assert.equal(apply(t).code, 0);
    const s = snapshot(t.root)["th/override-target.mdx"];
    assert.equal(fm(s, "category"), 'category: "shop"');
    assert.equal(fm(s, "tags"), 'tags: ["sme"]');
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("all-or-nothing: a multi-line tags: block aborts and writes nothing (no ledger either)", () => {
  const t = setup(["old-category.mdx", "multiline-tags.mdx"]);
  try {
    const before = snapshot(t.root);
    const a = apply(t);
    assert.equal(a.code, 1);
    assert.match(a.out, /multiline-tags\.mdx/);
    assert.deepEqual(snapshot(t.root), before);
    assert.equal(existsSync(t.ledger), false);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("0 mapped tags without an override = exit 1 (needs an override), nothing written", () => {
  const map = structuredClone(MAP);
  map.overrides = {};
  const t = setup(["override-target.mdx", "old-category.mdx"], map);
  try {
    map.tags["Claude Code"] = null;
    writeFileSync(t.mapPath, JSON.stringify(map));
    const before = snapshot(t.root);
    const a = apply(t);
    assert.equal(a.code, 1);
    assert.match(a.out, /needs an override/);
    assert.deepEqual(snapshot(t.root), before);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("an unknown raw value (not in the map, not a key) = exit 1", () => {
  const map = structuredClone(MAP);
  delete map.categories["AI News"];
  const t = setup(["old-category.mdx"], map);
  try {
    const a = apply(t);
    assert.equal(a.code, 1);
    assert.match(a.out, /AI News/);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("revert restores the exact old lines even after a neighbouring draft: line changed (BM-16 Phase B)", () => {
  const t = setup(["old-category.mdx"]);
  try {
    const before = snapshot(t.root)["th/old-category.mdx"].toString("utf8");
    assert.equal(apply(t).code, 0);
    const p = join(t.root, "content/posts/th/old-category.mdx");
    writeFileSync(p, readFileSync(p, "utf8").replace("draft: false", "draft: true # bm16-prune was=false"));
    assert.equal(revert(t).code, 0);
    assert.equal(readFileSync(p, "utf8"), before.replace("draft: false", "draft: true # bm16-prune was=false"));
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("usage errors exit 2", () => {
  const r = spawnSync(process.execPath, [APPLY], { encoding: "utf8" });
  assert.equal(r.status, 2);
  const r2 = spawnSync(process.execPath, [APPLY, "--revert"], { encoding: "utf8" });
  assert.equal(r2.status, 2);
});
