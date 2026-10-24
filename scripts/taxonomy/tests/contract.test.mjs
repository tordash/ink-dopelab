// BM-18 (tordash/dopelab-oracle#27) · review F2: the BM-04 route checks that hard-code taxonomy URLs must expect the
// key pages (SPEC S8, §8.1a), so `routes.py contract` and features.py's switcher rows can pass on the T11 build.
// Offline oracle = what the app serves after BM-18: a tag page exists iff a non-draft post in that locale carries the
// key; a category page iff its non-draft count ≥ min_posts (content.ts getAllTags / getAllCategories). Everything else
// under /tag/ or /category/ is notFound() → 404 (old names included; their redirects are BM-08).
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
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".mdx"))) {
    const r = checkPost(readFileSync(new URL(f, dir), "utf8"), CAT, TAG);
    if (r.draft || !r.category) continue;
    counts.set(r.category, (counts.get(r.category) || 0) + 1);
    for (const t of r.tags || []) tags.add(t);
  }
  const cats = new Set(T.categories.filter((c) => (counts.get(c.key) || 0) >= (c.min_posts ?? 1)).map((c) => c.key));
  return { category: cats, tag: tags };
}
const LIVE = { th: live("th"), en: live("en") };

const TAX = /^\/blog(\/en)?\/(tag|category)\/([^/?#]+)$/;
/** {loc, kind, value} for a taxonomy page path, else null. */
function tax(path) {
  const m = TAX.exec(path);
  return m ? { loc: m[1] ? "en" : "th", kind: m[2], value: decodeURIComponent(m[3]) } : null;
}
const isLive = (p) => LIVE[p.loc][p.kind].has(p.value);

const rows = read("scripts/migration/checks/data/ac1-route-contract.tsv")
  .trim().split("\n").slice(1).map((l) => l.split("\t"))
  .map(([id, path, expect, location, source]) => ({ id, path, expect, location, source }));

// The 9 taxonomy rows of the BM-04 contract at d2b36bd (R09–R17, all 200 then) = the old-name URLs BM-18 retires.
const OLD = [
  "/blog/tag/ai", "/blog/tag/A%2FB-test", "/blog/tag/gpt-5.4", "/blog/tag/Kling%203.0",
  "/blog/tag/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%95%E0%B8%A5%E0%B8%B2%E0%B8%94", "/blog/en/tag/karpathy",
  "/blog/category/AI%20News",
  "/blog/category/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%95%E0%B8%A5%E0%B8%B2%E0%B8%94%E0%B9%81%E0%B8%AA%E0%B8%99%E0%B8%AA%E0%B8%99%E0%B8%B8%E0%B8%81",
  "/blog/en/category/AI%20Workflow",
];

test("oracle sanity: live sets match the predicted sitemap counts (th 5 cats · en 5 cats · th 34 tags · en 29 tags)", () => {
  assert.equal(LIVE.th.category.size, 5);
  assert.equal(LIVE.en.category.size, 5);
  assert.equal(LIVE.th.tag.size, 34);
  assert.equal(LIVE.en.tag.size, 29);
});

test("contract: every 200 taxonomy row is a live key page; every 404 taxonomy row is not", () => {
  const taxRows = rows.filter((r) => tax(r.path));
  assert.ok(taxRows.length >= 18, `taxonomy rows ${taxRows.length}`);
  for (const r of taxRows) {
    const p = tax(r.path);
    if (r.expect === "200") assert.ok(isLive(p), `${r.id} ${r.path} expects 200 but ${p.loc} ${p.kind} "${p.value}" has no page`);
    else if (r.expect === "404") assert.ok(!isLive(p), `${r.id} ${r.path} expects 404 but it is a live key page`);
    else assert.fail(`${r.id} ${r.path}: unexpected status ${r.expect} for a taxonomy page`);
  }
});

test("contract: ids R09–R17 keep their slots (routes.py picks rows by id) and are live key pages", () => {
  for (let i = 9; i <= 17; i++) {
    const id = `R${String(i).padStart(2, "0")}`;
    const r = rows.find((x) => x.id === id);
    assert.ok(r && tax(r.path) && r.expect === "200" && isLive(tax(r.path)), `${id} ${r?.path}`);
  }
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, "ids unique");
  for (let i = 51; i <= 62; i++) assert.equal(rows.find((x) => x.id === `R${i}`).expect, "404", `R${i} (routes.py sitemap legacy probes)`);
});

test("contract: each old taxonomy URL of R09–R17 is kept as an expected 404 row", () => {
  for (const old of OLD) {
    const r = rows.find((x) => x.path === old);
    assert.ok(r, `missing row for ${old}`);
    assert.equal(r.expect, "404", `${r.id} ${old}`);
    assert.equal(r.location, "-", `${r.id}: a 404 row carries no Location`);
  }
});

test("routes.py R10 check = the display name of R10's key in the <h1> (names, not keys: AC7)", () => {
  const r10 = tax(rows.find((x) => x.id === "R10").path);
  assert.equal(r10.kind, "tag");
  const name = T.tags.find((t) => t.key === r10.value).names[r10.loc];
  const py = read("scripts/migration/checks/routes.py");
  assert.ok(py.includes(`R10_H1 = "${name}"`), `routes.py must pin R10_H1 = "${name}"`);
  assert.match(py, /rid == "R10"/);
});

// features.py SWITCH_ROWS: (start, landing). Landing rule = src/lib/routes.ts counterpartPath: the same key page in
// the other locale when it has a page there, else that locale's home.
function switchRows() {
  const py = read("scripts/migration/checks/features.py");
  const consts = Object.fromEntries([...py.matchAll(/^([A-Z_]+) = "([^"]+)"$/gm)].map((m) => [m[1], m[2]]));
  const body = /SWITCH_ROWS = \[[^\n]*\n([\s\S]*?)\n\]/.exec(py)[1];
  return [...body.matchAll(/\((\w+|"[^"]+"), "([^"]+)", "(\w+)"\)/g)].map((m) => ({
    start: m[1].startsWith('"') ? m[1].slice(1, -1) : consts[m[1]],
    land: m[2],
  }));
}

test("features.py SWITCH_ROWS: taxonomy starts are live key pages and land where counterpartPath sends them", () => {
  const sw = switchRows();
  assert.equal(sw.length, 11);
  const taxSw = sw.filter((r) => tax(r.start));
  assert.equal(taxSw.length, 5);
  for (const { start, land } of taxSw) {
    const p = tax(start);
    assert.ok(isLive(p), `${start} is not a live key page`);
    const other = p.loc === "th" ? "en" : "th";
    const prefix = other === "en" ? "/blog/en" : "/blog";
    const want = LIVE[other][p.kind].has(p.value) ? `${prefix}/${p.kind}/${encodeURIComponent(p.value)}` : prefix;
    assert.equal(land, want, start);
  }
  // both outcomes stay covered: a key page with a counterpart, and a th-only key → /blog/en
  assert.ok(taxSw.some(({ start, land }) => tax(land)), "a both-locale key row");
  assert.ok(taxSw.some(({ land }) => land === "/blog/en"), "a th-only key row");
  for (const { start, land } of sw) for (const u of [start, land]) assert.ok(!OLD.includes(u), `old URL ${u} in SWITCH_ROWS`);
});
