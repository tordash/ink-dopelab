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


if __name__ == "__main__":
    unittest.main()
