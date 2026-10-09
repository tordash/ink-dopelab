// BM-16 · apply/revert of the unpublish marker (SPEC §9.1, S1 · REQ AC4).
// Runs on synthetic MDX under scripts/prune/fixtures (outside content/, so velite never reads them).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { applyList, revert, kindOf, serializeMap, EMPTY_MAP } from "../apply.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "fixtures");
const SCRIPT = join(HERE, "..", "apply.mjs");
const HEADER = [
  "id", "locale", "slug", "pair", "title", "category", "tags", "date", "topic_class", "verdict", "hold", "bucket",
  "rule", "target", "gsc_clicks_90d", "gsc_impressions_90d", "backlinks", "caption_urls", "caption_urls_pair",
  "inbound_internal", "inbound_from_kept", "main_site_links", "legacy_url", "new_url", "orphans", "reason",
];

function root(files) {
  const r = mkdtempSync(join(tmpdir(), "bm16-apply-"));
  for (const [dest, src] of Object.entries(files)) {
    const p = join(r, "content", "posts", dest);
    mkdirSync(dirname(p), { recursive: true });
    copyFileSync(join(FIX, src), p);
  }
  mkdirSync(join(r, "content", "posts", "covers"), { recursive: true });
  writeFileSync(join(r, "content", "posts", "covers", "x.json"), "{}");
  return r;
}

function list(r, rows, name = "list.tsv") {
  const lines = [HEADER.join("\t")];
  for (const row of rows) lines.push(HEADER.map((c) => row[c] ?? "-").join("\t"));
  const p = join(r, name);
  writeFileSync(p, lines.join("\n") + "\n");
  return p;
}

const row = (locale, slug, rule, target, bucket = "drop") => ({ id: "D01", locale, slug, bucket, rule, target, reason: "fixture row" });
const read = (r, rel) => readFileSync(join(r, rel), "utf8");
const mapPath = (r) => join(r, "src", "lib", "prune", "prune-map.json");

test("was=false and was=absent round trips are byte-identical", () => {
  const r = root({ "th/a-false.mdx": "with-false.mdx", "en/b-absent.mdx": "no-draft.mdx" });
  const before = { a: read(r, "content/posts/th/a-false.mdx"), b: read(r, "content/posts/en/b-absent.mdx") };
  const lp = list(r, [row("th", "a-false", "R2", "https://dopelab.studio/blog/category/AI%20News"),
                      row("en", "b-absent", "R2", "https://dopelab.studio/blog/en/all")]);
  const res = applyList({ root: r, listPath: lp });
  assert.equal(res.code, 0, res.lines.join("\n"));
  assert.match(res.lines.join("\n"), /applied 2 · already 0 · skipped 0 · map 2 entries/);
  const a = read(r, "content/posts/th/a-false.mdx");
  const b = read(r, "content/posts/en/b-absent.mdx");
  assert.ok(a.includes("\ndraft: true # bm16-prune was=false\n") && !a.includes("draft: false"));
  assert.ok(b.includes('tags: ["c"]\ndraft: true # bm16-prune was=absent\n---\n'));
  // only the flag line changed
  const diff = (x, y) => x.split("\n").filter((ln, i) => ln !== y.split("\n")[i]);
  assert.deepEqual(diff(a, before.a), ["draft: true # bm16-prune was=false"]);
  const rv = revert({ root: r });
  assert.equal(rv.code, 0);
  assert.match(rv.lines.join("\n"), /reverted 2 · map reset/);
  assert.equal(read(r, "content/posts/th/a-false.mdx"), before.a);
  assert.equal(read(r, "content/posts/en/b-absent.mdx"), before.b);
  assert.equal(readFileSync(mapPath(r), "utf8"), serializeMap(EMPTY_MAP));
});

test("a second apply is a no-op and leaves the map bytes unchanged", () => {
  const r = root({ "th/a-false.mdx": "with-false.mdx" });
  const lp = list(r, [row("th", "a-false", "R1", "https://dopelab.studio/blog/other-post"),
                      { ...row("th", "kept", "-", "-", "keep") }]);
  assert.equal(applyList({ root: r, listPath: lp }).code, 0);
  const m1 = readFileSync(mapPath(r), "utf8");
  const f1 = read(r, "content/posts/th/a-false.mdx");
  const res = applyList({ root: r, listPath: lp });
  assert.equal(res.code, 0);
  assert.match(res.lines.join("\n"), /applied 0 · already 1 · skipped 1 · map 1 entries/);
  assert.equal(readFileSync(mapPath(r), "utf8"), m1);
  assert.equal(read(r, "content/posts/th/a-false.mdx"), f1);
});

for (const [name, files, rows, needle] of [
  ["missing slug", { "th/a-false.mdx": "with-false.mdx" },
   [row("th", "a-false", "R2", "https://dopelab.studio/blog/all"), row("th", "no-such", "R2", "https://dopelab.studio/blog/all")],
   /no-such/],
  ["a real draft: true", { "th/a-false.mdx": "with-false.mdx", "th/real.mdx": "real-draft.mdx" },
   [row("th", "a-false", "R2", "https://dopelab.studio/blog/all"), row("th", "real", "R2", "https://dopelab.studio/blog/all")],
   /real.*draft/],
  ["an odd draft line", { "th/a-false.mdx": "with-false.mdx", "th/odd.mdx": "odd-draft.mdx" },
   [row("th", "a-false", "R2", "https://dopelab.studio/blog/all"), row("th", "odd", "R2", "https://dopelab.studio/blog/all")],
   /odd.*draft/],
  ["two draft lines", { "th/a-false.mdx": "with-false.mdx", "th/dup.mdx": "dup-draft.mdx" },
   [row("th", "a-false", "R2", "https://dopelab.studio/blog/all"), row("th", "dup", "R2", "https://dopelab.studio/blog/all")],
   /dup.*draft/],
  ["a duplicate list row", { "th/a-false.mdx": "with-false.mdx" },
   [row("th", "a-false", "R2", "https://dopelab.studio/blog/all"), row("th", "a-false", "R2", "https://dopelab.studio/blog/all")],
   /duplicate/],
]) {
  test(`all-or-nothing: ${name} -> exit 1, 0 files written`, () => {
    const r = root(files);
    const before = Object.fromEntries(Object.keys(files).map((k) => [k, read(r, `content/posts/${k}`)]));
    const res = applyList({ root: r, listPath: list(r, rows) });
    assert.equal(res.code, 1);
    assert.match(res.lines.join("\n"), needle);
    for (const k of Object.keys(files)) assert.equal(read(r, `content/posts/${k}`), before[k]);
    assert.equal(existsSync(mapPath(r)), false);
  });
}

test("a malformed TSV is a data error", () => {
  const r = root({ "th/a-false.mdx": "with-false.mdx" });
  const p = join(r, "bad.tsv");
  writeFileSync(p, "locale\tslug\nth\ta-false\textra\n");
  assert.equal(applyList({ root: r, listPath: p }).code, 1);
});

test("map serialization: sorted keys, 2-space JSON + newline, kind from the target path", () => {
  const r = root({ "th/z-post.mdx": "with-false.mdx", "th/a-cat.mdx": "with-false.mdx", "en/m-list.mdx": "no-draft.mdx",
                   "th/g-gone.mdx": "no-draft.mdx" });
  const lp = list(r, [row("th", "z-post", "R1", "https://dopelab.studio/blog/kept-one"),
                      row("th", "a-cat", "R2", "https://dopelab.studio/blog/category/News%20%26%20Tools"),
                      row("en", "m-list", "R2", "https://dopelab.studio/blog/en/all"),
                      row("th", "g-gone", "R3", "-")]);
  assert.equal(applyList({ root: r, listPath: lp }).code, 0);
  const text = readFileSync(mapPath(r), "utf8");
  const m = JSON.parse(text);
  assert.equal(text, JSON.stringify(m, null, 2) + "\n");
  assert.deepEqual(Object.keys(m.posts), ["en/m-list", "th/a-cat", "th/g-gone", "th/z-post"]);
  assert.deepEqual(m.posts["th/z-post"], { rule: "R1", kind: "post", slug: "kept-one" });
  assert.deepEqual(m.posts["th/a-cat"], { rule: "R2", kind: "category", category: "News & Tools" });
  assert.deepEqual(m.posts["en/m-list"], { rule: "R2", kind: "list" });
  assert.deepEqual(m.posts["th/g-gone"], { rule: "R3", kind: "gone" });
  assert.match(m.source, /^list\.tsv sha256:[0-9a-f]{12}$/);
  assert.deepEqual(kindOf("R2", "https://dopelab.studio/blog/en/category/AI%20Workflow", "en"),
                   { kind: "category", category: "AI Workflow" });
});

test("revert only reads content/posts/{th,en}/*.mdx and resets the map", () => {
  const r = root({ "th/a-false.mdx": "with-false.mdx" });
  const rv = revert({ root: r });
  assert.equal(rv.code, 0);
  assert.match(rv.lines.join("\n"), /reverted 0 · map reset/);
  assert.equal(readFileSync(mapPath(r), "utf8"), serializeMap(EMPTY_MAP));
  assert.deepEqual(readdirSync(join(r, "content", "posts", "covers")), ["x.json"]);
});

test("the empty map is the committed byte-exact empty state", () => {
  assert.equal(serializeMap(EMPTY_MAP), '{\n  "source": null,\n  "posts": {}\n}\n');
  const committed = readFileSync(join(HERE, "..", "..", "..", "src", "lib", "prune", "prune-map.json"), "utf8");
  assert.equal(committed, serializeMap(EMPTY_MAP));
});

test("CLI: usage error exits 2, apply/revert exit 0", () => {
  const r = root({ "th/a-false.mdx": "with-false.mdx" });
  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" }).status, 2);
  const lp = list(r, [row("th", "a-false", "R2", "https://dopelab.studio/blog/all")]);
  const a = spawnSync(process.execPath, [SCRIPT, "--list", lp, "--root", r], { encoding: "utf8" });
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.match(a.stdout, /applied 1 · already 0 · skipped 0 · map 1 entries/);
  const v = spawnSync(process.execPath, [SCRIPT, "--revert", "--root", r], { encoding: "utf8" });
  assert.equal(v.status, 0);
  assert.match(v.stdout, /reverted 1 · map reset/);
});

// --- fix round 1 (review F2 · L1, tordash/dopelab-oracle#19) -------------------------------------------------

test("F2: a stale marker refuses apply; --revert then apply the smaller list leaves exactly that list hidden", () => {
  const r = root({ "th/a-false.mdx": "with-false.mdx", "en/b-absent.mdx": "no-draft.mdx" });
  const before = read(r, "content/posts/en/b-absent.mdx");
  const big = list(r, [row("th", "a-false", "R2", "https://dopelab.studio/blog/all"),
                       row("en", "b-absent", "R2", "https://dopelab.studio/blog/en/all")], "big.tsv");
  const small = list(r, [row("th", "a-false", "R2", "https://dopelab.studio/blog/all")], "small.tsv");
  assert.equal(applyList({ root: r, listPath: big }).code, 0);
  const marked = { a: read(r, "content/posts/th/a-false.mdx"), b: read(r, "content/posts/en/b-absent.mdx") };
  const m1 = readFileSync(mapPath(r), "utf8");
  const res = applyList({ root: r, listPath: small });
  assert.equal(res.code, 1);
  assert.match(res.lines.join("\n"), /FAIL en\/b-absent: hidden by an earlier apply .*run --revert, then apply/);
  assert.equal(read(r, "content/posts/th/a-false.mdx"), marked.a);       // nothing written
  assert.equal(read(r, "content/posts/en/b-absent.mdx"), marked.b);
  assert.equal(readFileSync(mapPath(r), "utf8"), m1);
  assert.equal(revert({ root: r }).code, 0);                              // the recovery path the message names
  const again = applyList({ root: r, listPath: small });
  assert.equal(again.code, 0, again.lines.join("\n"));
  assert.match(again.lines.join("\n"), /applied 1 · already 0 · skipped 0 · map 1 entries/);
  assert.equal(read(r, "content/posts/en/b-absent.mdx"), before);         // b is published again, byte-exact
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(mapPath(r), "utf8")).posts), ["th/a-false"]);
});

test("F2: a marker string in the post body (outside frontmatter) is not a stale marker", () => {
  const r = root({ "th/a-false.mdx": "with-false.mdx", "th/c-body.mdx": "with-false.mdx" });
  const p = join(r, "content", "posts", "th", "c-body.mdx");
  writeFileSync(p, read(r, "content/posts/th/c-body.mdx") + "\ndraft: true # bm16-prune was=false\n");
  const body = read(r, "content/posts/th/c-body.mdx");
  const res = applyList({ root: r, listPath: list(r, [row("th", "a-false", "R2", "https://dopelab.studio/blog/all")]) });
  assert.equal(res.code, 0, res.lines.join("\n"));
  assert.equal(read(r, "content/posts/th/c-body.mdx"), body);
  assert.equal(revert({ root: r }).code, 0);
  assert.equal(read(r, "content/posts/th/c-body.mdx"), body);             // revert leaves the body alone too
});
