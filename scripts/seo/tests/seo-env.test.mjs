// BM-05 (SPEC §5.2; AC8, AC10, AC13): the build-time switches in src/lib/seo-env.ts.
// The module is imported with BLOG_NOINDEX / INK_REDIRECT_MODE removed (Reflect.deleteProperty, BM-04 pattern), so its
// constants are the defaults; the resolvers are tested directly with arguments.
// Run: node --test scripts/seo/tests/*.test.mjs   (AC13 red run: BM05_RED=1 → fixtures/today.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const RED = Reflect.get(process.env, "BM05_RED") === "1";
for (const name of ["BLOG_NOINDEX", "INK_REDIRECT_MODE"]) Reflect.deleteProperty(process.env, name);
const E = RED ? await import("./fixtures/today.mjs") : await import("../../../src/lib/seo-env.ts");
const U = RED ? await import("./fixtures/today.mjs") : await import("../../../src/lib/urls.ts");
const legacy = JSON.parse(readFileSync(new URL("../../../src/lib/legacy-routes.json", import.meta.url), "utf8"));

test("module defaults with both variables unset: indexable, normal mode", () => {
  assert.equal(E.BLOG_NOINDEX, false);
  assert.equal(E.INK_REDIRECT_MODE, undefined);
  assert.equal(E.INK_CANONICAL, false);
});

test("resolveNoindex: \"1\" → true · \"0\" / \"\" / blank / undefined → false", () => {
  assert.equal(E.resolveNoindex("1"), true);
  assert.equal(E.resolveNoindex(" 1 "), true);
  for (const v of ["0", "", "  ", undefined]) assert.equal(E.resolveNoindex(v), false, String(v));
});

test("resolveNoindex: anything else fails (the build fails at config load) and the message names BLOG_NOINDEX", () => {
  for (const bad of ["true", "yes", "01", "1 0", "false", "on", "noindex"]) {
    assert.throws(() => E.resolveNoindex(bad), /BLOG_NOINDEX=.* is not supported/, bad);
  }
});

test("resolveRedirectMode: off / temporary / permanent (trimmed); unset or blank → undefined", () => {
  assert.equal(E.resolveRedirectMode("off"), "off");
  assert.equal(E.resolveRedirectMode(" off "), "off");
  assert.equal(E.resolveRedirectMode("temporary"), "temporary");
  assert.equal(E.resolveRedirectMode("permanent"), "permanent");
  for (const v of ["", "  ", undefined]) assert.equal(E.resolveRedirectMode(v), undefined, String(v));
});

test("resolveRedirectMode: anything else fails and the message names INK_REDIRECT_MODE (exact, case-sensitive)", () => {
  for (const bad of ["Off", "OFF", "on", "false", "0", "1", "temp", "301"]) {
    assert.throws(() => E.resolveRedirectMode(bad), /INK_REDIRECT_MODE=.* is not supported/, bad);
  }
});

test("REQ AC10: temporary / permanent give the same absolute URLs as unset; only off is ink-shaped", () => {
  const ctxFor = (raw) => ({ siteUrl: "https://dopelab.studio", basePath: "/blog", legacy,
    inkCanonical: E.resolveRedirectMode(raw) === "off" });
  const pages = [[{ kind: "home" }, "th"], [{ kind: "list" }, "en"], [{ kind: "post", slug: "agent-teams-11-ai" }, "en"],
                 [{ kind: "tag", value: "A/B-test" }, "th"], [{ kind: "category", value: "Startup & Investment" }, "th"]];
  for (const [page, loc] of pages) {
    const unset = U.absoluteUrl(page, loc, ctxFor(undefined));
    assert.ok(unset.startsWith("https://dopelab.studio/blog"), unset);
    assert.equal(U.absoluteUrl(page, loc, ctxFor("temporary")), unset);
    assert.equal(U.absoluteUrl(page, loc, ctxFor("permanent")), unset);
    const o = U.absoluteUrl(page, loc, ctxFor("off"));
    assert.ok(o.startsWith(legacy.legacy_origin + "/" + loc), o);
  }
  assert.equal(U.fileUrl("sitemap", ctxFor("temporary")), U.fileUrl("sitemap", ctxFor(undefined)));
  assert.equal(U.fileUrl("sitemap", ctxFor("off")), legacy.legacy_origin + "/sitemap.xml");
});
