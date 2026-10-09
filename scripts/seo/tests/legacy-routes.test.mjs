// BM-05 (SPEC §5.2, AC10/AC13): shape of the committed mode-off legacy map src/lib/legacy-routes.json.
// The file is GENERATED from BM-03 url-rules.json by scripts/seo/gen-legacy-routes.mjs (REQ D3: never typed by hand).
// The drift check against the real rules is a separate command (the dopelab repo is not part of the ink test run):
//   node scripts/seo/gen-legacy-routes.mjs --rules <dopelab>/deliverables/blog-migration/data/url-rules.json --check
// Run: node --test scripts/seo/tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const legacy = JSON.parse(readFileSync(new URL("../../../src/lib/legacy-routes.json", import.meta.url), "utf8"));

const KINDS = ["home", "list", "about", "contact", "post", "tag", "category"];
const PARAM = { post: ":slug", tag: ":tag", category: ":cat" };
// The 16 rule ids D3 allows (R-HOME.*, R-LIST.th/en, R-PAGE.*, R-TAG.*, R-CAT.*, R-POST.*, R-FEED.*).
const ALLOWED_IDS = [
  "R-CAT.en", "R-CAT.th", "R-FEED.feed", "R-FEED.sitemap", "R-HOME.en", "R-HOME.th", "R-LIST.en", "R-LIST.th",
  "R-PAGE.en-about", "R-PAGE.en-contact", "R-PAGE.th-about", "R-PAGE.th-contact", "R-POST.en", "R-POST.th",
  "R-TAG.en", "R-TAG.th",
];

test("legacy map: 7 kinds x 2 locales + 2 files, nothing else", () => {
  assert.deepEqual(Object.keys(legacy.routes).sort(), ["en", "files", "th"]);
  for (const loc of ["th", "en"]) assert.deepEqual(Object.keys(legacy.routes[loc]).sort(), [...KINDS].sort(), loc);
  assert.deepEqual(Object.keys(legacy.routes.files).sort(), ["feed", "sitemap"]);
});

test("legacy map: post/tag/category templates end in exactly one :slug / :tag / :cat; static routes have none", () => {
  for (const loc of ["th", "en"]) {
    for (const kind of KINDS) {
      const t = legacy.routes[loc][kind];
      const params = t.match(/:[a-z]+/g) ?? [];
      if (PARAM[kind]) {
        assert.deepEqual(params, [PARAM[kind]], `${loc}/${kind} ${t}`);
        assert.ok(t.endsWith(PARAM[kind]), `${loc}/${kind} ${t}`);
      } else {
        assert.deepEqual(params, [], `${loc}/${kind} ${t}`);
      }
      // th routes start /th, en routes start /en (the legacy ink locale prefix is always present)
      assert.ok(t === `/${loc}` || t.startsWith(`/${loc}/`), `${loc}/${kind} ${t}`);
    }
  }
  assert.equal(legacy.routes.files.sitemap, "/sitemap.xml");
  assert.equal(legacy.routes.files.feed, "/feed.xml");
});

test("legacy map: legacy_origin is an https origin; no value starts with the new basePath", () => {
  assert.match(legacy.legacy_origin, /^https:\/\/[^/]+$/);
  const values = [...Object.values(legacy.routes.th), ...Object.values(legacy.routes.en), ...Object.values(legacy.routes.files)];
  assert.equal(values.length, 16);
  for (const v of values) {
    assert.ok(v.startsWith("/"), v);
    assert.ok(!/^\/blog(\/|$)/.test(v), v);
  }
});

test("legacy map: rule ids = exactly the 16 allowed ids, never X-*, R-ROOT, R-LIST.bare, R-LOCLESS, R-FALLBACK.*", () => {
  const ids = Object.values(legacy.rule_ids ?? {});
  assert.deepEqual([...ids].sort(), ALLOWED_IDS);
  for (const id of ids) assert.ok(!/^(X-|R-ROOT|R-LIST\.bare|R-LOCLESS|R-FALLBACK)/.test(id), id);
  assert.deepEqual(Object.keys(legacy.rule_ids).sort(),
    [...KINDS.flatMap((k) => [`th/${k}`, `en/${k}`]), "files/feed", "files/sitemap"].sort());
});

test("legacy map: provenance (rules version, landing mode i, rules sha256)", () => {
  assert.match(legacy.rules_version, /^\d+\.\d+\.\d+$/);
  assert.equal(legacy.landing_mode, "i");
  assert.match(legacy.rules_sha256, /^[0-9a-f]{64}$/);
});
