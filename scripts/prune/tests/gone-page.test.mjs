// BM-16 · the 410 page renderer + its link helpers (SPEC §9.3, S3 · REQ AC6).
// gone-page.ts is import-free, erasable TypeScript, so Node 25 runs it directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderGonePage, listHubHref, blogHomeHref } from "../../../src/lib/prune/gone-page.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "..", "src");
const BANNED = /#F0A828|#FFD700|Prompt|Syne|Space Mono|teal/i;

const page = (o = {}) => renderGonePage({ locale: "th", title: "ข่าวเก่า", hubHref: "/th/blog", homeHref: "/th", ...o });

test("410 page: noindex, TH + EN lines, hub + home links, lang", () => {
  const html = page();
  assert.ok(html.startsWith("<!doctype html>"));
  assert.match(html, /<html lang="th">/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.ok(html.includes("บทความนี้ถูกเก็บแล้ว"));
  assert.ok(html.includes("This article was retired"));
  assert.match(html, /<a class="btn" href="\/th\/blog">ดูบทความทั้งหมด · All articles<\/a>/);
  assert.match(html, /<a class="home" href="\/th">หน้าแรกบล็อก · Blog home<\/a>/);
  assert.match(renderGonePage({ locale: "en", title: "", hubHref: "/en/blog", homeHref: "/en" }), /<html lang="en">/);
});

test("hub/home hrefs for both bases (no basePath today, /blog after BM-04)", () => {
  assert.equal(listHubHref("th", ""), "/th/blog");
  assert.equal(listHubHref("en", ""), "/en/blog");
  assert.equal(blogHomeHref("th", ""), "/th");
  assert.equal(blogHomeHref("en", ""), "/en");
  assert.equal(listHubHref("th", "/blog"), "/blog/all");
  assert.equal(listHubHref("en", "/blog"), "/blog/en/all");
  assert.equal(blogHomeHref("th", "/blog"), "/blog");
  assert.equal(blogHomeHref("en", "/blog"), "/blog/en");
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
});

test("sources: no quoted blog-path literal, gone-page.ts is import-free, route imports are expected", () => {
  const gp = readFileSync(join(SRC, "lib", "prune", "gone-page.ts"), "utf8");
  const route = readFileSync(join(SRC, "app", "api", "gone", "route.ts"), "utf8");
  for (const s of [gp, route]) assert.equal(/["'`]\/blog/.test(s), false);
  assert.equal(/^import /m.test(gp), false);
  assert.ok(route.includes('export const dynamic = "force-dynamic"'));
  assert.ok(route.includes("status: 410"));
  for (const s of [gp, route]) {
    assert.equal(BANNED.test(s), false);
    assert.equal(s.includes("Tor Supakit"), false);
  }
});
