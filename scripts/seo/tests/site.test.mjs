// BM-05 (SPEC §5.2; REQ D2, S-1, AC13): the SITE_URL resolver in src/lib/site.ts.
// Imported with NEXT_PUBLIC_SITE_URL removed (Reflect.deleteProperty), so SITE_URL is the code fallback.
// Run: node --test scripts/seo/tests/*.test.mjs   (AC13 red run: BM05_RED=1 → fixtures/today.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";

const RED = Reflect.get(process.env, "BM05_RED") === "1";
Reflect.deleteProperty(process.env, "NEXT_PUBLIC_SITE_URL");
const S = RED ? await import("./fixtures/today.mjs") : await import("../../../src/lib/site.ts");

test("fallback is the new host https://dopelab.studio (every bm/* preview builds with it)", () => {
  assert.equal(S.DEFAULT_SITE_URL, "https://dopelab.studio");
  assert.equal(S.SITE_URL, "https://dopelab.studio");
  for (const v of [undefined, "", "  ", "\n"]) assert.equal(S.resolveSiteUrl(v), "https://dopelab.studio", JSON.stringify(v));
});

test("trim + trailing slashes (the env value has shipped with a trailing newline)", () => {
  assert.equal(S.resolveSiteUrl("https://dopelab.studio\n"), "https://dopelab.studio");
  assert.equal(S.resolveSiteUrl(" https://dopelab.studio "), "https://dopelab.studio");
  assert.equal(S.resolveSiteUrl("https://dopelab.studio///"), "https://dopelab.studio");
  assert.equal(S.resolveSiteUrl("http://127.0.0.1:4552"), "http://127.0.0.1:4552");
});

test("S-1: a path, query, hash or non-http(s) value fails, naming NEXT_PUBLIC_SITE_URL (a path would give /blog/blog)", () => {
  for (const bad of ["https://dopelab.studio/blog", "https://dopelab.studio/x/", "https://dopelab.studio?x=1",
                     "https://dopelab.studio#top", "dopelab.studio", "ftp://dopelab.studio", "https://", "//dopelab.studio"]) {
    assert.throws(() => S.resolveSiteUrl(bad), /NEXT_PUBLIC_SITE_URL=.* is not supported/, bad);
  }
});
