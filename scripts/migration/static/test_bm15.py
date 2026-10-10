"""BM-15 unit tests for the pure functions of bm15.py (stdlib only, no server, no build).

  python3.13 -m unittest scripts/migration/static/test_bm15.py

Fixtures are inline. The full AC6 value list (stories/BM-15/data/odd-char-rows.tsv, outside this repo) is checked
too when it exists: set BM15_DATA to that data dir (default: the dopelab story folder); the test skips otherwise.
"""
from __future__ import annotations

import csv
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bm15  # noqa: E402

DATA = Path(os.environ.get(
    "BM15_DATA", str(Path.home() / "Projects/dopelab/ψ/writing/blog-migration/stories/BM-15/data")))

# BM-04 rv3 B1 build log, lines 30–51 (stories/BM-04/evidence/rv3-b1-unset-build-222514.txt): every page route ƒ
BM04_TABLE = """Route (app)
┌ ○ /_not-found
├ ƒ /[locale]
├ ƒ /[locale]/[slug]
├ ƒ /[locale]/about
├ ƒ /[locale]/all
├ ƒ /[locale]/category/[category]
├ ƒ /[locale]/contact
├ ƒ /[locale]/tag/[tag]
├ ƒ /api/newsletter
├ ƒ /api/og
├ ○ /apple-icon.jpg
├ ƒ /feed.xml
├ ○ /icon.jpg
├ ○ /robots.txt
└ ○ /sitemap.xml


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
"""

# synthetic Next 16 table after BM-15: SSG page routes with their path sub-lines
SSG_TABLE = """Route (app)
┌ ○ /_not-found
├ ● /[locale]
│ ├ /th
│ └ /en
├ ● /[locale]/[slug]
│ ├ /th/anthropic-ipo-350b
│ ├ /th/90-percent-business-from-phone
│ └ [+149 more paths]
├ ● /[locale]/about
│ ├ /th/about
│ └ /en/about
├ ● /[locale]/all
│ ├ /th/all
│ └ /en/all
├ ● /[locale]/category/[category]
│ └ [+42 more paths]
├ ● /[locale]/contact
│ ├ /th/contact
│ └ /en/contact
├ ● /[locale]/tag/[tag]
│ └ [+527 more paths]
├ ƒ /api/newsletter
├ ƒ /api/og
├ ○ /apple-icon.jpg
├ ƒ /feed.xml
├ ○ /icon.jpg
├ ○ /robots.txt
└ ○ /sitemap.xml
  ├ /sitemap.xml
  └ /sitemap.xml/x


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
●  (SSG)      prerendered as static HTML (uses generateStaticParams)
ƒ  (Dynamic)  server-rendered on demand
"""

# SPEC §4 named rows: public path -> predicted prerender key
KEY_ROWS = [
    ("/blog", "/th"),
    ("/blog/en", "/en"),
    ("/blog/about", "/th/about"),
    ("/blog/en/all", "/en/all"),
    ("/blog/anthropic-ipo-350b", "/th/anthropic-ipo-350b"),
    ("/blog/tag/A%2FB-test", "/th/tag/A%2FB-test"),
    ("/blog/tag/Kling%203.0", "/th/tag/Kling 3.0"),
    ("/blog/tag/gpt-5.4", "/th/tag/gpt-5.4"),
    ("/blog/tag/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%95%E0%B8%A5%E0%B8%B2%E0%B8%94", "/th/tag/การตลาด"),
    ("/blog/category/Data%20%26%20Analytics", "/th/category/Data & Analytics"),
    ("/blog/en/category/Startup%20%26%20Investment", "/en/category/Startup & Investment"),
    ("/blog/en/tag/karpathy", "/en/tag/karpathy"),
]

# encodeURIComponent reference values (JavaScript), for the odd characters the content uses
ENC_ROWS = [
    ("A/B-test", "A%2FB-test"),
    ("Kling 3.0", "Kling%203.0"),
    ("gpt-5.4", "gpt-5.4"),
    ("Data & Analytics", "Data%20%26%20Analytics"),
    ("การตลาด", "%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%95%E0%B8%A5%E0%B8%B2%E0%B8%94"),
    ("it's (ok)! ~*", "it's%20(ok)!%20~*"),
]


class Encoding(unittest.TestCase):
    def test_enc_matches_encodeURIComponent(self):
        for raw, want in ENC_ROWS:
            self.assertEqual(bm15.enc(raw), want, raw)

    def test_enc_on_odd_char_rows(self):
        p = DATA / "odd-char-rows.tsv"
        if not p.exists():
            self.skipTest(f"{p} not found")
        with p.open(encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh, delimiter="\t"))
        self.assertGreater(len(rows), 0)
        for r in rows:
            last = r["public_path"].rsplit("/", 1)[1]
            self.assertEqual(bm15.enc(r["value"]), last, r["value"])
            self.assertEqual(bm15.url_to_key(r["public_path"]), r["predicted_key"], r["public_path"])


class UrlToKey(unittest.TestCase):
    def test_spec_rows(self):
        for pub, key in KEY_ROWS:
            self.assertEqual(bm15.url_to_key(pub), key, pub)

    def test_slash_stays_escaped(self):
        self.assertEqual(bm15.url_to_key("/blog/tag/A%2FB-test"), "/th/tag/A%2FB-test")
        self.assertNotIn("/A/B", bm15.url_to_key("/blog/tag/A%2FB-test"))

    def test_expected_rows_from_posts(self):
        posts = [
            {"locale": "th", "slugAsParams": "p1", "tags": ["A/B-test", "ai"], "category": "Data & Analytics"},
            {"locale": "th", "slugAsParams": "p2", "tags": ["ai", "AI"], "category": "AI News", "draft": True},
            {"locale": "en", "slugAsParams": "p3", "tags": ["Kling 3.0"], "category": "AI Workflow"},
        ]
        rows = bm15.expected_rows(posts)
        pubs = [r[2] for r in rows]
        self.assertEqual(len(rows), 4 + 1 + 2 + 1 + 4 + 1 + 1 + 1)  # pages + post + tags + cat, per locale
        self.assertIn("/blog/tag/A%2FB-test", pubs)
        self.assertIn("/blog/en/tag/Kling%203.0", pubs)
        self.assertNotIn("/blog/p2", pubs)  # draft
        for r in rows:
            self.assertEqual(bm15.url_to_key(r[2]), r[3], r[2])


class RouteTable(unittest.TestCase):
    def test_bm04_log_all_dynamic_fails(self):
        table = bm15.parse_route_table(BM04_TABLE)
        self.assertEqual(table["/[locale]/tag/[tag]"], "ƒ")
        self.assertEqual(table[bm15.PROXY], "ƒ")
        routes_f, problems = bm15.judge_routes(table)
        self.assertEqual(routes_f, 7)
        self.assertTrue(problems)

    def test_ssg_table_passes(self):
        table = bm15.parse_route_table(SSG_TABLE)
        self.assertEqual(table["/[locale]"], "●")
        self.assertNotIn("/th", table)  # path sub-lines are not routes
        self.assertNotIn("/sitemap.xml/x", table)
        routes_f, problems = bm15.judge_routes(table)
        self.assertEqual((routes_f, problems), (0, []))

    def test_unexpected_dynamic_route_fails(self):
        table = bm15.parse_route_table(SSG_TABLE.replace("├ ○ /icon.jpg", "├ ƒ /icon.jpg"))
        routes_f, problems = bm15.judge_routes(table)
        self.assertEqual(routes_f, 1)
        self.assertIn("/icon.jpg", " ".join(problems))

    def test_missing_page_route_fails(self):
        table = bm15.parse_route_table(SSG_TABLE.replace("├ ● /[locale]/contact\n", ""))
        _, problems = bm15.judge_routes(table)
        self.assertIn("/[locale]/contact", " ".join(problems))

    def test_other_api_route_allowed(self):
        table = bm15.parse_route_table(SSG_TABLE.replace("├ ƒ /api/og\n", "├ ƒ /api/og\n├ ƒ /api/other\n"))
        self.assertEqual(bm15.judge_routes(table), (0, []))


def page(canonical_in_body: bool = False, canonical: str = "https://ink.dopelab.studio/th/tag/ai",
         main: str = "<h1>ai</h1><p>2 posts</p>", chunk: str = "82abf2d65f5428ae", build: str = "c6dTrDhG553P38RR5SMgm") -> str:
    canon = f'<link rel="canonical" href="{canonical}"/>'
    return (
        '<!DOCTYPE html><html lang="th"><head><meta charSet="utf-8"/><title>#ai | INK by DopeLab</title>'
        '<meta name="description" content="2 posts"/>'
        + ("" if canonical_in_body else canon)
        + '<link rel="alternate" hrefLang="th" href="https://ink.dopelab.studio/th/tag/ai"/>'
        '<meta property="og:url" content="https://ink.dopelab.studio/th/tag/ai"/>'
        '<meta name="twitter:card" content="summary_large_image"/>'
        f'<script src="/blog/_next/static/chunks/{chunk}.js" async=""></script></head>'
        '<body><header><a href="/blog">INK</a></header>'
        + (canon if canonical_in_body else "")
        + f'<main class="flex-1">{main}<a href="/blog/p1">P1</a>'
        '<img src="/blog/static/p1.jpg" alt=""/><script type="application/ld+json">{"a":1}</script></main>'
        f'<link rel="preload" href="/blog/_next/static/media/{chunk}.woff2"/>'
        f'<a href="/blog/_next/data/{build}/x.json">x</a>'
        f'<script>self.__next_f.push([1,"0:{{\\"P\\":null,\\"b\\":\\"{build}\\"}}"])</script></body></html>'
    )


class Extractor(unittest.TestCase):
    def test_fields(self):
        d = bm15.extract(page())
        self.assertEqual(d["lang"], ["th"])
        self.assertEqual(d["canonical"], ["https://ink.dopelab.studio/th/tag/ai"])
        self.assertEqual(d["hreflang"], [["th", "https://ink.dopelab.studio/th/tag/ai"]])
        self.assertIn(["og:url", "https://ink.dopelab.studio/th/tag/ai"], d["social"])
        self.assertEqual(d["jsonld"], ['{"a":1}'])
        self.assertEqual(d["main_text"], "ai 2 posts P1")
        self.assertEqual(d["h1_main"], ["ai"])
        self.assertIn("/blog/p1", d["main_hrefs"])
        self.assertEqual(d["meta_outside_head"], [])

    def test_identical_pages_no_mismatch(self):
        self.assertEqual(bm15.diff_fields(bm15.extract(page()), bm15.extract(page())), [])

    def test_canonical_in_body_flagged(self):
        d = bm15.extract(page(canonical_in_body=True))
        self.assertEqual(len(d["meta_outside_head"]), 1)
        self.assertIn("canonical", d["meta_outside_head"][0])

    def test_changed_canonical_flagged(self):
        a = bm15.extract(page())
        b = bm15.extract(page(canonical="https://ink.dopelab.studio/th/tag/AI"))
        self.assertEqual(bm15.diff_fields(a, b), ["canonical"])

    def test_changed_main_text_flagged(self):
        a = bm15.extract(page())
        b = bm15.extract(page(main="<h1>ai</h1><p>3 posts</p>"))
        self.assertEqual(bm15.diff_fields(a, b), ["main_text"])

    def test_ignores_next_static_and_build_id(self):
        a = bm15.extract(page())
        b = bm15.extract(page(chunk="ffffffffffffffff", build="ZZZZZZZZZZZZZZZZZZZZZ"))
        self.assertEqual(bm15.diff_fields(a, b), [])

    def test_hreflang_link_origin_normalised(self):
        h4511 = [("link", '<http://localhost:4511/blog/about>; rel="alternate"; hreflang="th", '
                          '<http://localhost:4511/blog/en/about>; rel="alternate"; hreflang="en"'),
                 ("link", '</blog/_next/static/media/a.woff2>; rel=preload; as="font"; crossorigin=""')]
        h4512 = [("link", '<http://localhost:4512/blog/about>; rel="alternate"; hreflang="th", '
                          '<http://localhost:4512/blog/en/about>; rel="alternate"; hreflang="en"')]
        a = bm15.hreflang_links(h4511, "http://localhost:4511")
        self.assertEqual(a, ['<<origin>/blog/about>; rel="alternate"; hreflang="th"',
                             '<<origin>/blog/en/about>; rel="alternate"; hreflang="en"'])
        self.assertEqual(a, bm15.hreflang_links(h4512, "http://localhost:4512"))
        h_bad = [("link", '<http://localhost:4512/blog/about>; rel="alternate"; hreflang="th"')]
        self.assertNotEqual(a, bm15.hreflang_links(h_bad, "http://localhost:4512"))

    def test_font_preloads_header_or_html(self):
        hdr = [("link", '</blog/_next/static/media/a.woff2>; rel=preload; as="font"; crossorigin=""; type="font/woff2"')]
        html = ('<html><head><link rel="preload" href="/blog/_next/static/media/a.woff2" as="font" crossorigin=""/>'
                '<link rel="preload" href="/x.png" as="image"/></head><body></body></html>')
        self.assertEqual(bm15.font_preloads(hdr, "<html><head></head></html>"),
                         (["/blog/_next/static/media/a.woff2"], []))
        self.assertEqual(bm15.font_preloads([], html), ([], ["/blog/_next/static/media/a.woff2"]))

    def test_link_split(self):
        self.assertEqual(bm15.link_entries('<a>; rel="alternate", <b>; rel=preload'),
                         ['<a>; rel="alternate"', "<b>; rel=preload"])


class CacheJudge(unittest.TestCase):
    def test_static_ok(self):
        probs, smax = bm15.judge_cache(200, [("cache-control", "s-maxage=31536000"),
                                              ("vary", "rsc, next-router-state-tree, Accept-Encoding")])
        self.assertEqual((probs, smax), ([], "31536000"))

    def test_dynamic_fails(self):
        probs, _ = bm15.judge_cache(200, [("cache-control", "private, no-cache, no-store, max-age=0, must-revalidate"),
                                          ("set-cookie", "NEXT_LOCALE=th; Path=/blog; SameSite=lax")])
        joined = " ".join(probs)
        for word in ("s-maxage", "private", "no-store", "no-cache", "set-cookie"):
            self.assertIn(word, joined)

    def test_vary_cookie_fails(self):
        probs, _ = bm15.judge_cache(200, [("cache-control", "s-maxage=1"), ("vary", "Cookie")])
        self.assertTrue(probs)


if __name__ == "__main__":
    unittest.main()
