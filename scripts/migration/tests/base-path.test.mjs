// BM-04 review: unit tests for the base-path resolver (REQ AC4d, AC9) and the ADR-01 X4 asset-prefix gate (TASKS X4-a).
// Run: node --test 'scripts/migration/tests/*.test.mjs'   (Node strips the erasable TS types of src/lib/base-path.ts)
// Import happens with BLOG_BASE_PATH unset (the module resolves BASE_PATH at load); the functions are tested directly.
// (Reflect.deleteProperty, not `process.env.<NAME>`: AC9 / invariants.sh allows only src/lib/base-path.ts to read it.)
import { test } from "node:test";
import assert from "node:assert/strict";

Reflect.deleteProperty(process.env, "BLOG_BASE_PATH");
const { DEFAULT_BASE_PATH, BASE_PATH, resolveBasePath, withBasePath, resolveAssetPrefix } = await import(
  "../../../src/lib/base-path.ts"
);

test("base path: unset/blank → /blog, anything else throws with the AC4d message", () => {
  assert.equal(DEFAULT_BASE_PATH, "/blog");
  assert.equal(BASE_PATH, "/blog");
  assert.equal(resolveBasePath(undefined), "/blog");
  assert.equal(resolveBasePath(""), "/blog");
  assert.equal(resolveBasePath("  "), "/blog");
  assert.equal(resolveBasePath("/blog"), "/blog");
  for (const bad of ["/x", "/blog/", "blog", "/Blog", "/"]) {
    assert.throws(() => resolveBasePath(bad), /is not supported: MDX content links are rewritten for "\/blog" only/);
  }
});

test("withBasePath: prefixes root-relative paths only", () => {
  assert.equal(withBasePath("/"), "/blog");
  assert.equal(withBasePath("/logo-sphere.jpg"), "/blog/logo-sphere.jpg");
  assert.equal(withBasePath("/_vercel"), "/blog/_vercel");
  for (const keep of ["//cdn.example/x.js", "https://x.example/a.jpg", "#top", "data:image/png;base64,AA", "rel/a.png"]) {
    assert.equal(withBasePath(keep), keep);
  }
});

const P = "https://ink-dopelab.vercel.app/blog";

test("X4-a: prefix off when unset/blank, whatever VERCEL_ENV says", () => {
  for (const env of [undefined, "", "production", "preview", "development"]) {
    assert.equal(resolveAssetPrefix(undefined, env), undefined);
    assert.equal(resolveAssetPrefix("  ", env), undefined);
  }
});

test("X4-a: prefix on only when VERCEL_ENV is unset (local proof) or production", () => {
  assert.equal(resolveAssetPrefix(P, undefined), P);
  assert.equal(resolveAssetPrefix(P, ""), P);
  assert.equal(resolveAssetPrefix(P, "production"), P);
  assert.equal(resolveAssetPrefix(` ${P} `, "production"), P);
  // previews (bm/* pushes, Gate 1) and dev never get it, even with a mis-scoped env var
  assert.equal(resolveAssetPrefix(P, "preview"), undefined);
  assert.equal(resolveAssetPrefix(P, "development"), undefined);
});

test("X4-a: an invalid prefix fails the build (absolute http(s), no trailing slash, no query/fragment)", () => {
  for (const bad of ["not-a-url", "/blog", "//ink-dopelab.vercel.app/blog", `${P}/`, "https://", "ftp://x.example/blog",
                     `${P}?v=1`, `${P}#x`, "https://x.example/b log"]) {
    assert.throws(() => resolveAssetPrefix(bad, "production"), /BLOG_ASSET_PREFIX=.* is not supported/, bad);
    // validation runs before the VERCEL_ENV gate: a bad value fails a preview build too
    assert.throws(() => resolveAssetPrefix(bad, "preview"), /is not supported/, bad);
  }
});
