// BM-04 review: unit tests for the base-path resolver (REQ AC4d, AC9) and the ADR-01 X4 asset-prefix gate (TASKS X4-a)
// + X4-f (Helm (ก), #5 6018411118): raw <img> srcs on the asset host when the prefix is on, unchanged when off.
// Run: node --test 'scripts/migration/tests/*.test.mjs'   (Node strips the erasable TS types of src/lib/base-path.ts)
// Import happens with BLOG_BASE_PATH / BLOG_ASSET_PREFIX / VERCEL_ENV unset (the module resolves BASE_PATH and
// ASSET_PREFIX at load, so the module defaults are the prefix-OFF state); the functions are tested directly.
// (Reflect.deleteProperty, not `process.env.<NAME>`: AC9 / invariants.sh allows only src/lib/base-path.ts to read it.)
import { test } from "node:test";
import assert from "node:assert/strict";

for (const name of ["BLOG_BASE_PATH", "BLOG_ASSET_PREFIX", "VERCEL_ENV"]) Reflect.deleteProperty(process.env, name);
const {
  DEFAULT_BASE_PATH, BASE_PATH, ASSET_PREFIX, resolveBasePath, withBasePath, resolveAssetPrefix,
  withAssetHost, publicAssetSrc, withAssetHostMdxRuntime,
} = await import("../../../src/lib/base-path.ts");

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

// ---- X4-f: raw <img> srcs ------------------------------------------------------------------------------------------
const MDX_IMG = "/blog/images/blog/remote-control-hero.jpg"; // MDX rewrite (T10)
const DIAGRAM = "/blog/diagrams/remote-control-concept.svg"; // MDX rewrite (T10)
const COVER = "/blog/static/90-percent-business-from-phone-07bd9f.jpg"; // velite base `${BASE_PATH}/static/`
const KEEP = ["https://x.example/a.jpg", "http://x.example/a.jpg", "//cdn.example/x.jpg", "data:image/png;base64,AA",
              "#top", "/blog", "/blogger/x.jpg", "/images/x.jpg", "/_next/image?url=%2Fblog%2Fa.jpg", "rel/a.png", ""];

test("X4-f: module default is prefix OFF when BLOG_ASSET_PREFIX is unset", () => {
  assert.equal(ASSET_PREFIX, undefined);
  for (const s of [MDX_IMG, DIAGRAM, COVER, ...KEEP]) assert.equal(withAssetHost(s), s, s);
  assert.equal(publicAssetSrc("/logo-sphere.jpg"), "/blog/logo-sphere.jpg");
  assert.equal(publicAssetSrc("/author-tor.jpg"), "/blog/author-tor.jpg");
});

test("X4-f: prefix on → /blog/x becomes <prefix>/x (MDX image, diagram, velite cover, public file), never /blog/blog", () => {
  assert.equal(withAssetHost(MDX_IMG, P), "https://ink-dopelab.vercel.app/blog/images/blog/remote-control-hero.jpg");
  assert.equal(withAssetHost(DIAGRAM, P), "https://ink-dopelab.vercel.app/blog/diagrams/remote-control-concept.svg");
  assert.equal(withAssetHost(COVER, P), "https://ink-dopelab.vercel.app/blog/static/90-percent-business-from-phone-07bd9f.jpg");
  assert.equal(publicAssetSrc("/logo-sphere.jpg", P), "https://ink-dopelab.vercel.app/blog/logo-sphere.jpg");
  assert.equal(publicAssetSrc("/hero-bg.jpg", "http://127.0.0.1:4482/blog"), "http://127.0.0.1:4482/blog/hero-bg.jpg");
  for (const s of [MDX_IMG, DIAGRAM, COVER]) assert.ok(!withAssetHost(s, P).includes("/blog/blog"), s);
});

test("X4-f: prefix on leaves http(s):, //, data:, #, bare /blog and paths outside the base path untouched", () => {
  for (const s of KEEP) assert.equal(withAssetHost(s, P), s, s);
  // already on the asset host → unchanged (idempotent)
  assert.equal(withAssetHost(withAssetHost(MDX_IMG, P), P), withAssetHost(MDX_IMG, P));
});

test("X4-f: the gate — on only via resolveAssetPrefix's VERCEL_ENV rule (unset / production), off for preview / dev", () => {
  for (const env of [undefined, "", "production"]) {
    assert.equal(withAssetHost(MDX_IMG, resolveAssetPrefix(P, env)), `${P}/images/blog/remote-control-hero.jpg`, String(env));
  }
  for (const env of ["preview", "development"]) {
    assert.equal(withAssetHost(MDX_IMG, resolveAssetPrefix(P, env)), MDX_IMG, env);
    assert.equal(publicAssetSrc("/logo-sphere.jpg", resolveAssetPrefix(P, env)), "/blog/logo-sphere.jpg", env);
  }
  assert.equal(withAssetHost(MDX_IMG, resolveAssetPrefix(undefined, "production")), MDX_IMG);
  assert.equal(withAssetHost(MDX_IMG, resolveAssetPrefix("", "production")), MDX_IMG);
});

test("X4-f: MDX runtime — literal JSX <img> src mapped when on; components, other tags and prefix off untouched", () => {
  const calls = [];
  const fake = (tag) => (type, props, key) => (calls.push(tag), { type, props, key });
  const rt = { Fragment: "F", jsx: fake("jsx"), jsxs: fake("jsxs") };
  assert.equal(withAssetHostMdxRuntime(rt), rt); // module default = off → the same object, nothing wrapped
  assert.equal(withAssetHostMdxRuntime(rt, undefined), rt);
  const on = withAssetHostMdxRuntime(rt, P);
  assert.notEqual(on, rt);
  assert.equal(on.Fragment, "F");
  const props = { src: "/blog/diagrams/knowledge-graph/kg-overview.svg", alt: "a", width: "800" };
  const el = on.jsx("img", props, "k1");
  assert.deepEqual(el, { type: "img", props: { src: `${P}/diagrams/knowledge-graph/kg-overview.svg`, alt: "a", width: "800" }, key: "k1" });
  assert.deepEqual(Object.keys(el.props), ["src", "alt", "width"]); // attribute order kept
  assert.equal(props.src, "/blog/diagrams/knowledge-graph/kg-overview.svg"); // input not mutated
  assert.equal(on.jsxs("img", { src: COVER }).props.src, `${P}/static/90-percent-business-from-phone-07bd9f.jpg`);
  const comp = () => null; // components.img (markdown images) is mapped inside the component, not here
  assert.equal(on.jsx(comp, props).props, props);
  assert.equal(on.jsx("a", { href: "/blog/all" }).props.href, "/blog/all");
  assert.equal(on.jsx("source", { src: "/blog/videos/x.mp4" }).props.src, "/blog/videos/x.mp4"); // images only (Helm (ก))
  assert.equal(on.jsx("img", { src: "https://x.example/a.png" }).props.src, "https://x.example/a.png");
  assert.equal(on.jsx("img", null).props, null);
  assert.deepEqual(calls.slice(0, 2), ["jsx", "jsxs"]);
});
