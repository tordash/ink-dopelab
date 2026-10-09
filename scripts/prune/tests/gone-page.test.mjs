// BM-16 · the 410 page renderer + its link helpers (SPEC §9.3, S3 · REQ AC6).
// gone-page.ts is import-free, erasable TypeScript, so Node 25 runs it directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderGonePage, goneHrefs } from "../../../src/lib/prune/gone-page.ts";

// review F3 (#19, post-rebase): the route builds the links from BM-04's BASE_PATH + ROUTES, so the test imports the
// same two modules. Same pattern as scripts/migration/tests/base-path.test.mjs: clear the env first, then a dynamic
// import (a static import would be hoisted above the delete). Reflect.deleteProperty, not process.env.<NAME>
// (invariants.sh #6: only src/lib/base-path.ts may read it).
for (const name of ["BLOG_BASE_PATH", "BLOG_ASSET_PREFIX", "VERCEL_ENV"]) Reflect.deleteProperty(process.env, name);
const { BASE_PATH } = await import("../../../src/lib/base-path.ts");
const { ROUTES } = await import("../../../src/lib/routes.ts");

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "..", "src");
const BANNED = /#F0A828|#FFD700|Prompt|Syne|Space Mono|teal/i;

const page = (o = {}) => renderGonePage({ locale: "th", title: "ข่าวเก่า", hubHref: "/blog/all", homeHref: "/blog", ...o });

test("410 page: noindex, TH + EN lines, hub + home links, lang", () => {
  const html = page();
  assert.ok(html.startsWith("<!doctype html>"));
  assert.match(html, /<html lang="th">/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.ok(html.includes("บทความนี้ถูกเก็บแล้ว"));
  assert.ok(html.includes("This article was retired"));
  assert.match(html, /<a class="btn" href="\/blog\/all">ดูบทความทั้งหมด · All articles<\/a>/);
  assert.match(html, /<a class="home" href="\/blog">หน้าแรกบล็อก · Blog home<\/a>/);
  assert.match(renderGonePage({ locale: "en", title: "", hubHref: "/blog/en/all", homeHref: "/blog/en" }), /<html lang="en">/);
});

test("review F3: hub/home hrefs = BM-04 routes under BASE_PATH, exact strings (th + en), never the legacy shape", () => {
  // exactly what route.ts passes: goneHrefs(loc, BASE_PATH, ROUTES). Exact strings, not prefixes: a trailing "/"
  // (e.g. withBasePath("/en" + ROUTES.home) -> "/blog/en/") would 308, and the HTTP dry run has only a th R3 row.
  assert.equal(BASE_PATH, "/blog");
  assert.deepEqual(goneHrefs("th", BASE_PATH, ROUTES), { hubHref: "/blog/all", homeHref: "/blog" });
  assert.deepEqual(goneHrefs("en", BASE_PATH, ROUTES), { hubHref: "/blog/en/all", homeHref: "/blog/en" });
  for (const loc of ["th", "en"]) {
    const html = renderGonePage({ locale: loc, title: "x", ...goneHrefs(loc, BASE_PATH, ROUTES) });
    const hrefs = [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(hrefs, loc === "th" ? ["/blog/all", "/blog"] : ["/blog/en/all", "/blog/en"], loc);
    for (const h of hrefs) {
      assert.equal(/^\/(th|en)(\/|$)/.test(h), false, `legacy pre-BM-04 shape: ${h}`);
      assert.equal(h.endsWith("/"), false, `trailing slash (308): ${h}`);
    }
  }
});

test("review F3: route.ts builds the links from BASE_PATH + ROUTES, never request.nextUrl.basePath (SPEC R4)", () => {
  const route = readFileSync(join(SRC, "app", "api", "gone", "route.ts"), "utf8");
  assert.match(route, /^import \{ BASE_PATH \} from "@\/lib\/base-path";$/m);
  assert.match(route, /^import \{ ROUTES \} from "@\/lib\/routes";$/m);
  assert.ok(route.includes("goneHrefs(loc, BASE_PATH, ROUTES)"));
  assert.equal(/nextUrl\.basePath/.test(route), false);
});

test("the title is HTML-escaped; an empty title draws no title line", () => {
  const html = page({ title: `<script>alert("x")</script> & 'q'` });
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;"));
  assert.ok(!html.includes("<script"));
  assert.ok(!page({ title: "" }).includes('class="t"'));
  assert.ok(page({ hubHref: `/x"><b>` }).includes('href="/x&quot;&gt;&lt;b&gt;"'));
});

test("brand only: no scripts, no banned tokens, no real names, brand colours present", () => {
  const html = page();
  assert.equal((html.match(/<script/g) || []).length, 0);
  assert.equal(BANNED.test(html), false);
  assert.equal(html.includes("Tor Supakit"), false);
  for (const c of ["#000000", "#FFFFFF", "#FFCC00"]) assert.ok(html.includes(c), c);
  assert.ok(html.includes("Kanit"));
  // review L2 (#19 · REQ §7 brand): League Spartan for the EN line, loaded with Kanit
  assert.match(html, /family=Kanit:[^"]*&family=League\+Spartan:/);
  assert.match(html, /\.en\{[^}]*font-family:'League Spartan',Kanit,sans-serif\}/);
});

test("sources: no quoted blog-path literal, gone-page.ts is import-free, route imports are expected", () => {
  const gp = readFileSync(join(SRC, "lib", "prune", "gone-page.ts"), "utf8");
  const route = readFileSync(join(SRC, "app", "api", "gone", "route.ts"), "utf8");
  for (const s of [gp, route]) assert.equal(/["'`]\/blog/.test(s), false);
  assert.equal(/^import /m.test(gp), false);
  // review F4: no route-segment `dynamic` export / dynamic APIs (BM-04 invariants.sh #4 guards BM-15 static rendering).
  // A GET handler that reads `request` is dynamic anyway (build route table: ƒ /api/gone).
  assert.equal(/cookies\(\)|headers\(\)|export const dynamic/.test(route), false);
  assert.ok(route.includes("request.nextUrl.searchParams"));
  assert.ok(route.includes("status: 410"));
  for (const s of [gp, route]) {
    assert.equal(BANNED.test(s), false);
    assert.equal(s.includes("Tor Supakit"), false);
  }
});
