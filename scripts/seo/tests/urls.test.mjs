// BM-05 (SPEC §5.2; AC2 unit, AC7 footer, AC10 mode off, AC13): the pure URL module src/lib/urls.ts.
// Values are the real rows of stories/BM-05/data/unit-samples.tsv (sha256 ba3e700b3c9e9b26…, posts.json df084082…).
// Run: node --test scripts/seo/tests/*.test.mjs
// AC13 red run: BM05_RED=1 loads fixtures/today.mjs (today's behaviour) instead, and every file must report failures.
// (No env variable is read with dot access here, SPEC §5.3 #3 / TASKS T3: the flag is read with Reflect.get.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const RED = Reflect.get(process.env, "BM05_RED") === "1";
const U = RED ? await import("./fixtures/today.mjs") : await import("../../../src/lib/urls.ts");
const R = await import("../../../src/lib/routes.ts");
const legacy = JSON.parse(readFileSync(new URL("../../../src/lib/legacy-routes.json", import.meta.url), "utf8"));

const SITE = "https://dopelab.studio";
const BASE = "/blog";
const normal = { siteUrl: SITE, basePath: BASE, inkCanonical: false, legacy };
const off = { ...normal, inkCanonical: true };
// The shared index (= getSharedSwitchIndex() shape) restricted to the sample values; th-only values are absent.
const shared = { posts: ["agent-teams-11-ai"], tags: ["agent-teams"], categories: ["Startup & Investment"] };
const THAI = "การตลาด";
const THAI_ENC = "%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%95%E0%B8%A5%E0%B8%B2%E0%B8%94";

// [case, page, locale, normal URL, mode-off URL, alternates (3 = th + en + x-default, 0 = none)]
const SAMPLES = [
  ["paired post (th)", { kind: "post", slug: "agent-teams-11-ai" }, "th",
    "https://dopelab.studio/blog/agent-teams-11-ai", "https://ink.dopelab.studio/th/blog/agent-teams-11-ai", 3],
  ["th-only post", { kind: "post", slug: "100-hours-claude-code-lessons" }, "th",
    "https://dopelab.studio/blog/100-hours-claude-code-lessons", "https://ink.dopelab.studio/th/blog/100-hours-claude-code-lessons", 0],
  ["shared tag (en)", { kind: "tag", value: "agent-teams" }, "en",
    "https://dopelab.studio/blog/en/tag/agent-teams", "https://ink.dopelab.studio/en/blog/tag/agent-teams", 3],
  ["th-only tag", { kind: "tag", value: "lessons-learned" }, "th",
    "https://dopelab.studio/blog/tag/lessons-learned", "https://ink.dopelab.studio/th/blog/tag/lessons-learned", 0],
  ["category with &", { kind: "category", value: "Startup & Investment" }, "th",
    "https://dopelab.studio/blog/category/Startup%20%26%20Investment",
    "https://ink.dopelab.studio/th/blog/category/Startup%20%26%20Investment", 3],
  ["encoded Thai tag", { kind: "tag", value: THAI }, "th",
    `https://dopelab.studio/blog/tag/${THAI_ENC}`, `https://ink.dopelab.studio/th/blog/tag/${THAI_ENC}`, 0],
  ["tag with /", { kind: "tag", value: "A/B-test" }, "th",
    "https://dopelab.studio/blog/tag/A%2FB-test", "https://ink.dopelab.studio/th/blog/tag/A%2FB-test", 0],
  ["tag with space", { kind: "tag", value: "AI tools" }, "th",
    "https://dopelab.studio/blog/tag/AI%20tools", "https://ink.dopelab.studio/th/blog/tag/AI%20tools", 0],
  ["static home th", { kind: "home" }, "th", "https://dopelab.studio/blog", "https://ink.dopelab.studio/th", 3],
  ["static home en", { kind: "home" }, "en", "https://dopelab.studio/blog/en", "https://ink.dopelab.studio/en", 3],
  ["static list th", { kind: "list" }, "th", "https://dopelab.studio/blog/all", "https://ink.dopelab.studio/th/blog", 3],
  ["static list en", { kind: "list" }, "en", "https://dopelab.studio/blog/en/all", "https://ink.dopelab.studio/en/blog", 3],
  ["static about th", { kind: "about" }, "th", "https://dopelab.studio/blog/about", "https://ink.dopelab.studio/th/about", 3],
  ["static about en", { kind: "about" }, "en", "https://dopelab.studio/blog/en/about", "https://ink.dopelab.studio/en/about", 3],
  ["static contact th", { kind: "contact" }, "th", "https://dopelab.studio/blog/contact", "https://ink.dopelab.studio/th/contact", 3],
  ["static contact en", { kind: "contact" }, "en", "https://dopelab.studio/blog/en/contact", "https://ink.dopelab.studio/en/contact", 3],
  // synthetic: no en-only page exists today; it must get no alternates (REQ AC2)
  ["synthetic en-only post", { kind: "post", slug: "zz-en-only" }, "en",
    "https://dopelab.studio/blog/en/zz-en-only", "https://ink.dopelab.studio/en/blog/zz-en-only", 0],
];

const other = (l) => (l === "th" ? "en" : "th");

test("absoluteUrl: every sample, normal mode (SITE_URL + basePath + en prefix + route; home has no trailing /)", () => {
  for (const [name, page, loc, want] of SAMPLES) assert.equal(U.absoluteUrl(page, loc, normal), want, name);
});

test("absoluteUrl: every sample, mode off (legacy origin + url-rules `from` template)", () => {
  for (const [name, page, loc, , want] of SAMPLES) assert.equal(U.absoluteUrl(page, loc, off), want, name);
});

test("newPath / legacyPath are the path parts of the two modes", () => {
  for (const [name, page, loc, n, o] of SAMPLES) {
    assert.equal(SITE + U.newPath(page, loc, BASE), n, name);
    assert.equal(legacy.legacy_origin + U.legacyPath(page, loc, legacy), o, name);
  }
});

test("routePath = the routes.ts helpers (ROUTES / postPath / tagPath / categoryPath)", () => {
  assert.equal(U.routePath({ kind: "home" }), R.ROUTES.home);
  assert.equal(U.routePath({ kind: "list" }), R.ROUTES.list);
  assert.equal(U.routePath({ kind: "about" }), R.ROUTES.about);
  assert.equal(U.routePath({ kind: "contact" }), R.ROUTES.contact);
  for (const s of ["agent-teams-11-ai", "100-hours-claude-code-lessons", "zz-en-only"]) {
    assert.equal(U.routePath({ kind: "post", slug: s }), R.postPath(s));
  }
  for (const v of ["agent-teams", "A/B-test", "AI tools", THAI, "Startup & Investment", "Kling 3.0"]) {
    assert.equal(U.routePath({ kind: "tag", value: v }), R.tagPath(v), v);
    assert.equal(U.routePath({ kind: "category", value: v }), R.categoryPath(v), v);
  }
});

test("localeSet: static routes in both; post/tag/category in both only when the exact value is shared", () => {
  for (const [name, page, loc, , , alts] of SAMPLES) {
    const want = alts === 3 ? ["th", "en"] : [loc];
    assert.deepEqual(U.localeSet(page, loc, shared), want, name);
  }
  // exact equality only: a case-fold or encoded variant is not the same value
  assert.deepEqual(U.localeSet({ kind: "tag", value: "Agent-Teams" }, "th", shared), ["th"]);
  assert.deepEqual(U.localeSet({ kind: "category", value: "Startup%20%26%20Investment" }, "th", shared), ["th"]);
});

test("hreflangs: paired → exactly th, en, x-default (= th URL); unpaired / synthetic en-only → undefined", () => {
  for (const ctx of [normal, off]) {
    for (const [name, page, loc, , , alts] of SAMPLES) {
      const h = U.hreflangs(page, loc, shared, ctx);
      if (alts === 0) {
        assert.equal(h, undefined, name);
        continue;
      }
      assert.deepEqual(Object.keys(h).sort(), ["en", "th", "x-default"], name);
      assert.equal(h.th, U.absoluteUrl(page, "th", ctx), name);
      assert.equal(h.en, U.absoluteUrl(page, "en", ctx), name);
      assert.equal(h["x-default"], h.th, name);
      // reciprocal by construction: the other side lists the same three URLs
      assert.deepEqual(U.hreflangs(page, other(loc), shared, ctx), h, name);
      // self is one of them
      assert.equal(h[loc], U.absoluteUrl(page, loc, ctx), name);
    }
  }
});

test("fileUrl: sitemap + feed in both modes", () => {
  assert.equal(U.fileUrl("sitemap", normal), "https://dopelab.studio/blog/sitemap.xml");
  assert.equal(U.fileUrl("feed", normal), "https://dopelab.studio/blog/feed.xml");
  assert.equal(U.fileUrl("sitemap", off), "https://ink.dopelab.studio/sitemap.xml");
  assert.equal(U.fileUrl("feed", off), "https://ink.dopelab.studio/feed.xml");
});

test("ogImageUrl: on SITE_URL + basePath, same query as today (& encoded), with and without category", () => {
  assert.equal(U.ogImageUrl({ title: "AI & You", locale: "th" }, SITE, BASE),
    "https://dopelab.studio/blog/api/og?title=AI%20%26%20You&locale=th");
  assert.equal(U.ogImageUrl({ title: "บทความทั้งหมด", locale: "en", category: "Startup & Investment" }, SITE, BASE),
    `https://dopelab.studio/blog/api/og?title=${encodeURIComponent("บทความทั้งหมด")}&locale=en&category=Startup%20%26%20Investment`);
});

test("coverUrl: SITE_URL + velite cover src (src already starts with the basePath)", () => {
  assert.equal(U.coverUrl("/blog/static/90-percent-business-from-phone-07bd9f.jpg", SITE),
    "https://dopelab.studio/blog/static/90-percent-business-from-phone-07bd9f.jpg");
});

test("ogFooterText: SITE_URL host + basePath (AC7)", () => {
  assert.equal(U.ogFooterText("https://dopelab.studio", "/blog"), "dopelab.studio/blog");
  assert.equal(U.ogFooterText("http://127.0.0.1:4552", "/blog"), "127.0.0.1:4552/blog");
});

test("assertSiteUrl (S-3): throws for the legacy origin naming NEXT_PUBLIC_SITE_URL and INK_REDIRECT_MODE=off; passes for the new one", () => {
  assert.throws(() => U.assertSiteUrl(legacy.legacy_origin, legacy.legacy_origin), /NEXT_PUBLIC_SITE_URL.*INK_REDIRECT_MODE=off/s);
  assert.throws(() => U.assertSiteUrl(legacy.legacy_origin.replace("https:", "http:"), legacy.legacy_origin), /NEXT_PUBLIC_SITE_URL/);
  assert.doesNotThrow(() => U.assertSiteUrl(SITE, legacy.legacy_origin));
  assert.doesNotThrow(() => U.assertSiteUrl("http://127.0.0.1:4552", legacy.legacy_origin));
});

test("no URL any function returns has /blog/blog, a // in the path, a trailing / or a /th/ segment (normal mode)", () => {
  for (const [name, page, loc] of SAMPLES) {
    const u = U.absoluteUrl(page, loc, normal);
    const path = u.slice(SITE.length);
    assert.ok(!path.includes("/blog/blog") && !path.includes("//") && !path.endsWith("/") && !/\/th(\/|$)/.test(path), `${name} ${u}`);
    assert.ok(loc === "th" || path.startsWith("/blog/en"), `${name} ${u}`);
  }
});
