"""BM-04 AC2 (named ac2_html.py, not html.py: a local html.py would shadow the stdlib `html` package that routes.py and
this script import): no path escapes /blog · next/image urls under /blog · no ink host in MDX bodies · <a href> equivalence.

  python3.13 scripts/migration/checks/ac2_html.py            # B1 (+ B0 for (d)); writes NEW ac2-*.tsv files

Pages = the 728 `new_path` rows of data/sitemap-map-mode-i.tsv (AC7 list), fetched no-follow from $B1_URL, plus the
2 client-rendered 404 surfaces read from the Playwright DOM after networkidle (SPEC §8.3, S9).
Collected: src, href, srcset/imagesrcset candidates, poster, action, url() in inline <style> + style="" and in every
linked .css (fetched once, relative url() resolved against the CSS URL).

  (a) a value whose path starts with a single "/" must be /blog or /blog/… · allow-list: "/feed.xml" only on
      <link rel=alternate type=application/rss+xml> and on an <a> inside <footer> (BM-05)
  (b) /_next/image?url=<u> → unquote(u) starts with /blog/
  (c) 0 "ink.dopelab.studio" between <article class="prose…"> and its </article> on the 151 post pages (R-POST)
  (d) 8 B0/B1 pairs: the B1 <a href> multiset == the urlmap image of the B0 <a href> multiset
      (BM-03 urlmap mode i; /_next/*, #… and non-ink hosts dropped; B0 /feed.xml maps to itself)

Every (a) value and (d) mismatch is tagged `mdx` (inside <article class="prose…">) or `component` (anywhere else).
Non-200 pages are listed; a non-200 that answers the same status on B0 is reported as base-defect (never excused).
Exit 0 = (a) 0 · (b) 0 · (c) 0 on all 151 · (d) 0 · 0 non-200 pages; 1 otherwise.
"""
from __future__ import annotations

import re
import sys
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, unquote, urljoin, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

WORKERS = 8
INK = "ink.dopelab.studio"
NEW_HOST = "dopelab.studio"
PAIRS = [
    ("/th", "/blog"),
    ("/th/blog", "/blog/all"),
    ("/th/blog/90-percent-business-from-phone", "/blog/90-percent-business-from-phone"),
    ("/th/blog/tag/ai", "/blog/tag/ai"),
    ("/en", "/blog/en"),
    ("/en/blog/agent-teams-11-ai", "/blog/en/agent-teams-11-ai"),
    ("/th/about", "/blog/about"),
    ("/en/contact", "/blog/en/contact"),
]
NOT_FOUND_SURFACES = ["/blog/zzz-not-a-post-bm04", "/blog/blog/anthropic-ipo-350b"]
BLOCK = re.compile(r"googletagmanager\.com|google-analytics\.com|analytics\.google\.com|giscus\.app|lin\.ee|lab\.dopelab\.studio|/_vercel/insights")
URL_ATTRS = ("src", "href", "poster", "action")
SET_ATTRS = ("srcset", "imagesrcset")
CSS_URL = re.compile(r"""url\(\s*(['"]?)(.*?)\1\s*\)""", re.S)


def split_srcset(v: str) -> list[str]:
    out = []
    for cand in re.split(r",\s+", v.strip()):
        cand = cand.strip()
        if cand:
            out.append(cand.split()[0])
    return out


class Collector(HTMLParser):
    """Collects URL-bearing attribute values with context (mdx = inside <article class="prose…">)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items: list[dict] = []
        self.styles: list[str] = []
        self.prose = 0
        self.footer = 0
        self._in_style = False

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if tag == "article":
            if self.prose:
                self.prose += 1
            elif (a.get("class", "").split() or [""])[0] == "prose":
                self.prose = 1
        if tag == "footer":
            self.footer += 1
        if tag == "style":
            self._in_style = True
        ctx = "mdx" if self.prose else "component"
        base = {"tag": tag, "ctx": ctx, "footer": self.footer > 0, "rel": a.get("rel", ""), "type": a.get("type", "")}
        for k, v in attrs:
            if v is None:
                continue
            if k in URL_ATTRS:
                self.items.append(dict(base, attr=k, value=v))
            elif k in SET_ATTRS:
                for c in split_srcset(v):
                    self.items.append(dict(base, attr=k, value=c))
            elif k == "style":
                for m in CSS_URL.finditer(v):
                    self.items.append(dict(base, attr="style-url", value=m.group(2)))

    def handle_endtag(self, tag):
        if tag == "article" and self.prose:
            self.prose -= 1
        if tag == "footer" and self.footer:
            self.footer -= 1
        if tag == "style":
            self._in_style = False

    def handle_data(self, data):
        if self._in_style:
            self.styles.append(data)


def path_part(v: str) -> str:
    for ch in "?#":
        i = v.find(ch)
        if i != -1:
            v = v[:i]
    return v


def escapes(v: str) -> bool:
    """(a): a single-slash value whose path is not /blog or under /blog/."""
    if not v.startswith("/") or v.startswith("//"):
        return False
    p = path_part(v)
    return not (p == "/blog" or p.startswith("/blog/"))


def allowed_feed(it: dict) -> bool:
    if it["value"] != "/feed.xml":
        return False
    rels = it["rel"].split()
    if it["tag"] == "link" and "alternate" in rels and it["type"] == "application/rss+xml":
        return True
    return it["tag"] == "a" and it["footer"]


def next_image_bad(v: str) -> str | None:
    """(b): return the decoded url when a /_next/image value points outside /blog/, else None."""
    if "/_next/image" not in v:
        return None
    q = parse_qs(urlsplit(v).query)
    u = (q.get("url") or [""])[0]
    return None if u.startswith("/blog/") else (u or "<no url param>")


def prose_slice(html: str) -> str | None:
    i = html.find('<article class="prose')
    if i == -1:
        return None
    depth, pos = 0, i
    for m in re.finditer(r"<article\b|</article>", html[i:]):
        depth += 1 if m.group(0) == "<article" else -1
        if depth == 0:
            return html[i:i + m.end()]
    return html[i:]


def fetch_text(base: str, path: str) -> tuple[int, str]:
    st, _h, b = C.fetch(base, path)
    return st, b.decode("utf-8", "replace")


def check_values(page: str, items: list[dict], viol: list, page_url: str):
    na = nb = 0
    for it in items:
        v = it["value"].strip()
        if it["attr"] == "style-url":
            if v.startswith("data:") or v.startswith("#"):
                continue
            v = path_of_url(urljoin(page_url, v), page_url)
        if escapes(v) and not allowed_feed(dict(it, value=v)):
            na += 1
            viol.append(["a", page, it["ctx"], it["tag"], it["attr"], v, ""])
        bad = next_image_bad(v)
        if bad is not None:
            nb += 1
            viol.append(["b", page, it["ctx"], it["tag"], it["attr"], v, f"url={bad}"])
    return na, nb


def path_of_url(abs_url: str, page_url: str) -> str:
    """Same-origin absolute URL → path (+query); other origins unchanged."""
    s, p = urlsplit(abs_url), urlsplit(page_url)
    if s.netloc == p.netloc:
        return s.path + (("?" + s.query) if s.query else "")
    return abs_url


# ------------------------------------------------------------------ (d) equivalence

def map_b0(h: str) -> str | None:
    """urlmap image of one B0 <a href>; None = dropped."""
    h = h.strip()
    if not h or h.startswith("#"):
        return None
    m = C.urlmap()
    if h.startswith("/") and not h.startswith("//"):
        if path_part(h).startswith("/_next/"):
            return None
        if h == "/feed.xml":
            return "/feed.xml"  # the one allowed delta (BM-05)
        dest = m.map_url("https://" + INK + h, C.rules(), "i")
        return h if dest == m.NO_REDIRECT else C.path_of(dest)
    host = urlsplit(h if "://" in h else "https:" + h if h.startswith("//") else "").netloc.lower()
    if host == INK:
        dest = m.map_url(h, C.rules(), "i")
        return h if dest == m.NO_REDIRECT else dest
    if host == NEW_HOST and path_part(urlsplit(h).path or "/").startswith("/blog"):
        return h
    return None


def keep_b1(h: str) -> str | None:
    h = h.strip()
    if not h or h.startswith("#"):
        return None
    if h.startswith("/") and not h.startswith("//"):
        p = path_part(h)
        return None if (p.startswith("/_next/") or p.startswith("/blog/_next/")) else h
    host = urlsplit(h if "://" in h else "https:" + h if h.startswith("//") else "").netloc.lower()
    if host == INK:
        return h
    if host == NEW_HOST and path_part(urlsplit(h).path or "/").startswith("/blog"):
        return h
    return None


def anchors(items: list[dict]) -> list[tuple[str, str]]:
    return [(it["value"], it["ctx"]) for it in items if it["tag"] == "a" and it["attr"] == "href"]


def equivalence(b0_path: str, b1_path: str, b1_items: list[dict], dviol: list) -> list:
    st0, h0 = fetch_text(C.B0_URL, b0_path)
    c0 = Collector()
    c0.feed(h0)
    m0: Counter = Counter()
    ctx0 = defaultdict(set)
    for v, ctx in anchors(c0.items):
        mv = map_b0(v)
        if mv is not None:
            m0[mv] += 1
            ctx0[mv].add(ctx)
    m1: Counter = Counter()
    ctx1 = defaultdict(set)
    for v, ctx in anchors(b1_items):
        kv = keep_b1(v)
        if kv is not None:
            m1[kv] += 1
            ctx1[kv].add(ctx)
    missing = m0 - m1   # expected (urlmap of B0) but not on B1
    extra = m1 - m0     # on B1 but not expected
    n_mdx = n_comp = 0
    for v, n in sorted(missing.items()):
        tag = "mdx" if ctx0[v] == {"mdx"} else "component"
        n_mdx += n if tag == "mdx" else 0
        n_comp += n if tag == "component" else 0
        dviol.append(["d", b1_path, tag, "a", "href", v, f"missing on B1 ×{n} (urlmap image of B0 {b0_path})"])
    for v, n in sorted(extra.items()):
        tag = "mdx" if ctx1[v] == {"mdx"} else "component"
        n_mdx += n if tag == "mdx" else 0
        n_comp += n if tag == "component" else 0
        dviol.append(["d", b1_path, tag, "a", "href", v, f"extra on B1 ×{n}"])
    mism = sum(missing.values()) + sum(extra.values())
    return [b0_path, b1_path, st0, sum(m0.values()), sum(m1.values()), sum(missing.values()), sum(extra.values()), mism, n_mdx, n_comp]


# ------------------------------------------------------------------ 404 surfaces (Playwright DOM)

DOM_JS = """() => {
  const out = [];
  for (const el of document.querySelectorAll('[href],[src],[srcset],[imagesrcset],[poster],[action]')) {
    for (const a of ['href','src','srcset','imagesrcset','poster','action']) {
      if (!el.hasAttribute(a)) continue;
      out.push({tag: el.tagName.toLowerCase(), attr: a, value: el.getAttribute(a),
                footer: !!el.closest('footer'), prose: !!el.closest('article.prose'),
                rel: el.getAttribute('rel') || '', type: el.getAttribute('type') || ''});
    }
  }
  return out;
}"""


def dom_surfaces(viol: list) -> list:
    from playwright.sync_api import sync_playwright
    rows = []
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        ctx = br.new_context(locale="th-TH", timezone_id="Asia/Bangkok", color_scheme="light")
        reached = []
        ctx.route("**/*", lambda r: r.abort() if BLOCK.search(r.request.url) else r.continue_())
        ctx.on("requestfinished", lambda req: reached.append(req.url) if BLOCK.search(req.url) else None)
        for p in NOT_FOUND_SURFACES:
            page = ctx.new_page()
            resp = page.goto(C.B1_URL + p, wait_until="networkidle", timeout=90000)
            raw = page.evaluate(DOM_JS)
            items = []
            for it in raw:
                vals = split_srcset(it["value"]) if it["attr"] in SET_ATTRS else [it["value"]]
                for v in vals:
                    items.append({"tag": it["tag"], "attr": it["attr"], "value": v, "footer": it["footer"],
                                  "ctx": "mdx" if it["prose"] else "component", "rel": it["rel"], "type": it["type"]})
            na, nb = check_values(p + " (DOM)", items, viol, C.B1_URL + p)
            hrefs = sorted({it["value"] for it in items if it["tag"] == "a"})
            rows.append([p, resp.status if resp else 0, len(items), na, nb, " ".join(hrefs)])
            page.close()
        ctx.close()
        br.close()
    return rows, len(reached)


# ------------------------------------------------------------------ main

def main() -> int:
    smap = C.read_tsv(C.DATA / "sitemap-map-mode-i.tsv")
    pages = [(r["new_path"], r["family"], r["old_url"]) for r in smap]

    def get(t):
        path, fam, old = t
        st, html = fetch_text(C.B1_URL, path)
        return path, fam, old, st, html

    with ThreadPoolExecutor(WORKERS) as ex:
        fetched = list(ex.map(get, pages))

    viol: list = []
    per_page: list = []
    css_seen: dict[str, str] = {}
    non200 = []
    c_count = c_pages = 0
    post_total = 0
    b1_items_by_path: dict[str, list[dict]] = {}
    for path, fam, old, st, html in fetched:
        page_url = C.B1_URL + path
        col = Collector()
        col.feed(html)
        b1_items_by_path[path] = col.items
        na, nb = check_values(path, col.items, viol, page_url)
        # inline <style> blocks
        for css in col.styles:
            for m in CSS_URL.finditer(css):
                u = m.group(2).strip()
                if u.startswith("data:") or u.startswith("#"):
                    continue
                v = path_of_url(urljoin(page_url, u), page_url)
                if escapes(v):
                    na += 1
                    viol.append(["a", path, "component", "style", "url()", v, "inline <style>"])
        for it in col.items:
            if it["tag"] == "link" and "stylesheet" in it["rel"].split():
                css_seen.setdefault(it["value"], path)
        nc = None
        if fam == "R-POST":
            post_total += 1
            if st == 200:
                sl = prose_slice(html)
                c_pages += 1
                if sl is None:  # a post page without its prose article counts as a failure, never as 0
                    nc = 1
                    viol.append(["c", path, "mdx", "article", "-", "-", 'no <article class="prose"> found'])
                else:
                    nc = sl.count(INK)
                    for m in re.finditer(re.escape(INK) + r"[^\s\"'<)]*", sl):
                        viol.append(["c", path, "mdx", "article", "text", m.group(0), ""])
                c_count += nc
        if st != 200:
            st0, _h, _b = C.fetch(C.B0_URL, C.path_of(old))
            non200.append(f"{path}={st}" + (f" (base-defect: B0 {C.path_of(old)}={st0})" if st0 == st else f" (B0 {st0})"))
        per_page.append([path, fam, st, len(col.items), na, nb, "-" if nc is None else nc])

    # linked CSS, fetched once each
    css_rows = []
    for href, first_page in sorted(css_seen.items()):
        css_url = urljoin(C.B1_URL + first_page, href)
        st, body = fetch_text(C.B1_URL, C.path_of(css_url) if css_url.startswith(C.B1_URL) else href)
        n_urls = n_bad = 0
        for m in CSS_URL.finditer(body):
            u = m.group(2).strip()
            if u.startswith("data:") or u.startswith("#"):
                continue
            n_urls += 1
            v = path_of_url(urljoin(css_url, u), C.B1_URL)
            if escapes(v):
                n_bad += 1
                viol.append(["a", href, "component", "css", "url()", v, f"in {href}"])
        css_rows.append([href, st, n_urls, n_bad])

    # (d) equivalence on the 8 pairs
    dviol: list = []
    d_rows = [equivalence(b0, b1, b1_items_by_path[b1] if b1 in b1_items_by_path else _collect(C.B1_URL, b1), dviol)
              for b0, b1 in PAIRS]
    viol.extend(dviol)

    # 404 surfaces
    dom_rows, reached = dom_surfaces(viol)

    a_all = [v for v in viol if v[0] == "a"]
    b_all = [v for v in viol if v[0] == "b"]
    d_mis = sum(r[7] for r in d_rows)
    a_mdx = sum(1 for v in a_all if v[2] == "mdx")
    d_mdx = sum(r[8] for r in d_rows)
    summary = (f"(a) {len(a_all)} [mdx {a_mdx} · component {len(a_all) - a_mdx}] · (b) {len(b_all)} · "
               f"(c) {c_count} on {c_pages}/{post_total} post pages · (d) {d_mis} mismatches [mdx {d_mdx} · component {d_mis - d_mdx}]")
    ok = (not a_all and not b_all and c_count == 0 and c_pages == post_total == 151 and d_mis == 0
          and not non200 and reached == 0 and all(r[1] == 404 for r in dom_rows))
    tail = [
        summary,
        f"pages fetched {len(fetched)} · non-200 {len(non200)}: {' '.join(non200) or '-'}",
        f"linked CSS files {len(css_rows)} · url() checked {sum(r[2] for r in css_rows)} · escapes {sum(r[3] for r in css_rows)}",
        "404 surfaces (Playwright DOM): " + " · ".join(f"{r[0]} status {r[1]} values {r[2]} (a) {r[3]} (b) {r[4]} a-hrefs [{r[5]}]" for r in dom_rows),
        f"blocked-host requests reached {reached}",
        "RESULT " + ("PASS" if ok else "FAIL"),
    ]
    head = C.header("html.py (AC2)") + [f"# B1 {C.B1_URL} · B0 {C.B0_URL} (d only)"]
    pv = C.write_tsv("ac2-violations", head, ["check", "page", "ctx", "tag", "attr", "value", "detail"], viol, tail)
    pp = C.write_tsv("ac2-pages", head, ["path", "family", "status", "values", "a", "b", "c_ink"], per_page, tail)
    pd = C.write_tsv("ac2-equivalence", head, ["b0_path", "b1_path", "b0_status", "b0_kept", "b1_kept", "missing_on_b1", "extra_on_b1", "mismatches", "mdx", "component"], d_rows, tail)
    print("\n".join(head))
    print("(d) per page: b0_path b1_path b0_status b0_kept b1_kept missing extra mismatches mdx component")
    for r in d_rows:
        print("  " + " ".join(str(x) for x in r))
    print(f"evidence {pv}\nevidence {pp}\nevidence {pd}")
    print("\n".join(tail))
    return 0 if ok else 1


def _collect(base: str, path: str) -> list[dict]:
    _st, html = fetch_text(base, path)
    c = Collector()
    c.feed(html)
    return c.items


if __name__ == "__main__":
    sys.exit(main())
