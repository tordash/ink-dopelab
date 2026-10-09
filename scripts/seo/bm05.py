#!/usr/bin/env python3.13
"""BM-05 checks (SPEC §5.1; TASKS T4-T6): SEO metadata on the new host. python3.13 stdlib only; local servers only.

  bm05.py data  --repo <tree> [--prune-counts <json>] [--label L]
  bm05.py sweep --target URL --repo <tree> --mode normal|noindex|off|asset [--base URL] [--asset-origin O]
                [--baseline <ink sitemap urls txt>] [--named-diff <txt>] [--label L]

Data (never a literal count): <tree>/.velite/posts.json (non-draft) → N = 8 + posts + tags(th,en) + categories(th,en),
the expected URL of every page in both modes (normal: SITE + /blog + en prefix + route; mode off: the legacy template
from <tree>/src/lib/legacy-routes.json, re-implemented here in Python, independent of the TS), the locale set per page
(REQ D6) and the 20 newest posts.

Sweep: GET <target>/blog/sitemap.xml (xmllint --noout + parse, entities decoded), then every <loc> origin-substituted
(normal: https://dopelab.studio + path → target; mode off: legacy loc → the data row's new path → target; path + query
byte-exact, no redirect following), plus the on-demand set. Locality guard (TASKS R7): only the --target / --base
origins are ever requested; an absolute URL that cannot be origin-substituted is counted as `unexpected origin` and
never fetched. Every run prints `non-local requests 0`.

Every run writes NEW bm05-<sub>-<label>-<HHMMSS>.{txt,tsv} files under $EVIDENCE_DIR (default: the BM-05 story
evidence dir) and ends with RESULT PASS|FAIL; exit 0 = PASS. Never deletes anything.
"""
from __future__ import annotations

import sys

sys.dont_write_bytecode = True  # scripts/seo gets no __pycache__

import argparse  # noqa: E402
import csv  # noqa: E402
import hashlib  # noqa: E402
import http.client  # noqa: E402
import io  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import subprocess  # noqa: E402
import time  # noqa: E402
import xml.etree.ElementTree as ET  # noqa: E402
from html.parser import HTMLParser  # noqa: E402
from pathlib import Path  # noqa: E402
from urllib.parse import quote, urlsplit  # noqa: E402

HERE = Path(__file__).resolve().parent
INK = HERE.parents[1]
os.environ.setdefault("EVIDENCE_DIR", str(Path.home() / "Projects/dopelab/ψ/writing/blog-migration/stories/BM-05/evidence"))
os.environ.setdefault("BM03_DIR", str(Path.home() / "Projects/dopelab/deliverables/blog-migration"))
sys.path.insert(0, str(INK / "scripts" / "migration" / "checks"))
import common as C  # noqa: E402  (BM-04 helpers, read only: header, evidence_path, urlmap)

SITE = "https://dopelab.studio"  # the expected SITE_URL (REQ D2: also the code fallback)
BASE = "/blog"
STATIC = [("home", "/"), ("list", "/all"), ("about", "/about"), ("contact", "/contact")]
ALLOWED = re.compile(r"^(R-HOME\.(th|en)|R-LIST\.(th|en)|R-PAGE\.(th|en)-(about|contact)|R-TAG\.(th|en)|"
                     r"R-CAT\.(th|en)|R-POST\.(th|en)|R-FEED\.(feed|sitemap))$")
OG_LOCALE = {"th": "th_TH", "en": "en_US"}
UA = "bm05-checks/1.0"


# ---------------------------------------------------------------------------------------------------- helpers
def enc(v: str) -> str:
    """JavaScript encodeURIComponent."""
    return quote(v, safe="-_.!~*'()")


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def origin_of(url: str) -> str:
    s = urlsplit(url)
    return f"{s.scheme}://{s.netloc}"


def path_query(url: str) -> str:
    s = urlsplit(url)
    return (s.path or "/") + (("?" + s.query) if s.query else "")


class Report:
    def __init__(self, sub: str, label: str):
        self.sub, self.label = sub, label
        self.lines: list[str] = []
        self.fails = 0

    def info(self, s: str) -> None:
        self.lines.append(s)
        print(s, flush=True)

    def check(self, ok: bool, s: str) -> bool:
        self.fails += 0 if ok else 1
        self.info(f"{'PASS' if ok else 'FAIL'} {s}")
        return ok

    def finish(self) -> int:
        self.info(f"RESULT {'PASS' if self.fails == 0 else f'FAIL ({self.fails})'}")
        p = C.evidence_path(f"bm05-{self.sub}-{self.label}", "txt")
        p.write_text("\n".join(self.lines) + "\n", encoding="utf-8")
        print(f"evidence {p}")
        return 0 if self.fails == 0 else 1


def write_table(prefix: str, cols: list[str], rows: list[list]) -> Path:
    """Plain TSV (csv module, same dialect as stories/BM-05/data/gen_spec_data.py) so `cut | sort | diff` works."""
    p = C.evidence_path(prefix, "tsv")
    with p.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter="\t", lineterminator="\n")
        w.writerow(cols)
        w.writerows(rows)
    return p


class Net:
    """No-follow HTTP to the allowed origins only (TASKS R7 locality guard). Keeps repeated headers."""

    def __init__(self, *origins: str | None):
        self.allowed = {origin_of(o) for o in origins if o}
        self.requests = 0
        self.nonlocal_requests = 0

    def get(self, origin: str, raw_path: str, host: str | None = None, method: str = "GET", timeout: float = 120.0):
        o = origin_of(origin)
        if o not in self.allowed:  # never reached by design; counted so the guard itself is observable
            self.nonlocal_requests += 1
            raise RuntimeError(f"locality guard: refusing {o}{raw_path}")
        u = urlsplit(o)
        if u.hostname not in ("127.0.0.1", "localhost", "::1"):
            self.nonlocal_requests += 1
            raise RuntimeError(f"locality guard: {o} is not a local server")
        self.requests += 1
        conn = http.client.HTTPConnection(u.hostname, u.port or 80, timeout=timeout)
        try:
            conn.putrequest(method, raw_path, skip_host=True, skip_accept_encoding=True)
            conn.putheader("Host", host or u.netloc)
            conn.putheader("User-Agent", UA)
            conn.putheader("Accept-Encoding", "identity")
            conn.endheaders()
            r = conn.getresponse()
            body = b"" if method == "HEAD" else r.read()
            return r.status, [(k.lower(), v) for k, v in r.getheaders()], body
        finally:
            conn.close()


def hvals(hdrs: list[tuple[str, str]], name: str) -> list[str]:
    return [v for k, v in hdrs if k == name]


def path_of_ref(page_url: str, href: str, target: str) -> str | None:
    """Resolve href against the (local) page URL. A result on the target origin or on SITE gives its path (+query);
    anything else (another host) gives None: it is never fetched."""
    from urllib.parse import urljoin
    if not href:
        return None
    u = urljoin(page_url, href)
    if origin_of(u) == origin_of(target):
        return path_query(u)
    if u == SITE or u.startswith(SITE + "/"):
        return path_query(u)
    return None


def xmllint_ok(body: bytes) -> tuple[bool, str]:
    r = subprocess.run(["xmllint", "--noout", "-"], input=body, capture_output=True)
    return r.returncode == 0, r.stderr.decode("utf-8", "replace").strip().splitlines()[0] if r.returncode else "ok"


# ---------------------------------------------------------------------------------------------------- data
def legacy_url(lr: dict, kind: str, loc: str, value: str = "") -> str:
    t = lr["routes"][loc][kind]
    t = re.sub(r":(slug|tag|cat)$", lambda _m: value if kind == "post" else enc(value), t)
    return lr["legacy_origin"] + t


def new_path(kind: str, loc: str, value: str = "") -> str:
    pre = BASE + ("/en" if loc == "en" else "")
    route = dict(STATIC).get(kind)
    if kind == "home":
        return pre
    if route:
        return pre + route
    if kind == "post":
        return f"{pre}/{value}"
    if kind == "tag":
        return f"{pre}/tag/{enc(value)}"
    if kind == "category":
        return f"{pre}/category/{enc(value)}"
    raise ValueError(kind)


def compute_data(repo: Path, site: str = SITE) -> dict:
    posts_p = repo / ".velite" / "posts.json"
    lr_p = repo / "src" / "lib" / "legacy-routes.json"
    posts = [p for p in json.loads(posts_p.read_text(encoding="utf-8")) if not p.get("draft")]
    lr = json.loads(lr_p.read_text(encoding="utf-8"))
    by = {loc: [p for p in posts if p["locale"] == loc] for loc in ("th", "en")}
    slugs = {loc: {p["slugAsParams"] for p in by[loc]} for loc in by}
    tags = {loc: list(dict.fromkeys(t for p in by[loc] for t in p["tags"])) for loc in by}
    cats = {loc: list(dict.fromkeys(p["category"] for p in by[loc])) for loc in by}
    shared = {"post": slugs["th"] & slugs["en"], "tag": set(tags["th"]) & set(tags["en"]),
              "category": set(cats["th"]) & set(cats["en"])}
    post_by = {(p["locale"], p["slugAsParams"]): p for p in posts}
    raw = []
    for loc in ("th", "en"):
        for kind, _ in STATIC:
            raw.append((kind, loc, "", True))
        raw += [("post", loc, p["slugAsParams"], p["slugAsParams"] in shared["post"]) for p in by[loc]]
        raw += [("tag", loc, t, t in shared["tag"]) for t in tags[loc]]
        raw += [("category", loc, c, c in shared["category"]) for c in cats[loc]]
    rows = []
    for kind, loc, value, paired in raw:
        r = {"kind": kind, "locale": loc, "value": value, "new_url": site + new_path(kind, loc, value),
             "legacy_url": legacy_url(lr, kind, loc, value), "locale_set": "th+en" if paired else loc,
             "alternates": 3 if paired else 0}
        if kind == "post":
            p = post_by[(loc, value)]
            r["title"] = p["title"]
            r["cover"] = (p.get("cover") or {}).get("src", "")
            r["category"] = p["category"]
        rows.append(r)
    idx = {(r["kind"], r["locale"], r["value"]): r for r in rows}
    feed = sorted(posts, key=lambda p: p["date"], reverse=True)[:20]
    n = len(rows)
    paired = sum(1 for r in rows if r["alternates"])
    return {
        "rows": rows, "idx": idx, "lr": lr, "n": n, "paired": paired, "unpaired": n - paired,
        "posts": len(posts), "posts_th": len(by["th"]), "posts_en": len(by["en"]), "pairs": len(shared["post"]),
        "tags": len(tags["th"]) + len(tags["en"]), "categories": len(cats["th"]) + len(cats["en"]),
        "posts_sha": sha(posts_p), "lr_sha": sha(lr_p), "feed": feed,
        "by_new": {r["new_url"]: r for r in rows}, "by_legacy": {r["legacy_url"]: r for r in rows},
    }


def data_summary(d: dict) -> str:
    return (f"N {d['n']} (8 + posts {d['posts']} + tags {d['tags']} + categories {d['categories']}) · paired {d['paired']}"
            f" · unpaired {d['unpaired']} · post pairs {d['pairs']} · source posts.json@{d['posts_sha'][:16]}")


def cmd_data(a) -> int:
    rep = Report("data", a.label)
    for h in C.header("bm05.py data"):
        rep.info(h)
    d = compute_data(a.repo)
    rep.info(f"# repo {a.repo} · posts.json sha256 {d['posts_sha']} · legacy-routes.json sha256 {d['lr_sha']}")
    rep.info(data_summary(d))
    p = write_table(f"bm05-data-{a.label}", ["kind", "locale", "value", "new_url", "legacy_url", "locale_set", "alternates"],
                    [[r[k] for k in ("kind", "locale", "value", "new_url", "legacy_url", "locale_set", "alternates")]
                     for r in d["rows"]])
    rep.info(f"rows {p}")
    rep.info("feed top 20: " + " ".join(f"{p['locale']}/{p['slugAsParams']}" for p in d["feed"]))
    ok = d["n"] == 8 + d["posts"] + d["tags"] + d["categories"] and d["paired"] + d["unpaired"] == d["n"]
    rep.check(ok, f"formula N = 8 + posts + tags + categories = {d['n']} · paired + unpaired = N")
    if a.prune_counts:
        pc = json.loads(Path(a.prune_counts).read_text(encoding="utf-8"))
        want_n, want_pairs = pc["sitemap"]["expected_loc"], pc["posts"]["pairs_after"]
        rep.check(d["n"] == want_n, f"N {d['n']} {'==' if d['n'] == want_n else '≠'} expected_loc {want_n} ({a.prune_counts})")
        rep.check(d["pairs"] == want_pairs,
                  f"post pairs {d['pairs']} {'==' if d['pairs'] == want_pairs else '≠'} pairs_after {want_pairs}")
    return rep.finish()


# ---------------------------------------------------------------------------------------------------- HTML
class PageParser(HTMLParser):
    """Collects the SEO fields. Attribute values and text arrive entity-decoded (html.parser)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_head = False
        self.head_seen = False
        self.title: str | None = None
        self._in_title = False
        self._title_buf: list[str] = []
        self.canonical: list[str] = []
        self.hreflang: list[tuple[str, str]] = []
        self.rss: list[str] = []
        self.meta: dict[str, list[str]] = {}
        self.anchors: list[dict] = []
        self.jsonld: list[str] = []
        self._in_jsonld = False
        self._jsonld_buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if tag == "head":
            self.in_head, self.head_seen = True, True
        elif tag == "title" and self.in_head and self.title is None:
            self._in_title = True
        elif tag == "link" and self.in_head:
            rel = a.get("rel", "").lower().split()
            if "canonical" in rel:
                self.canonical.append(a.get("href", ""))
            if "alternate" in rel and "hreflang" in a:
                self.hreflang.append((a["hreflang"], a.get("href", "")))
            if "alternate" in rel and a.get("type", "").lower() == "application/rss+xml":
                self.rss.append(a.get("href", ""))
        elif tag == "meta" and self.in_head:
            key = a.get("property") or a.get("name")
            if key:
                self.meta.setdefault(key.lower(), []).append(a.get("content", ""))
        elif tag == "a":
            self.anchors.append(a)
        elif tag == "script" and a.get("type", "").lower() == "application/ld+json":
            self._in_jsonld, self._jsonld_buf = True, []

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == "head":
            self.in_head = False
        elif tag == "title" and self._in_title:
            self._in_title = False
            self.title = "".join(self._title_buf)
        elif tag == "script" and self._in_jsonld:
            self._in_jsonld = False
            self.jsonld.append("".join(self._jsonld_buf))

    def handle_data(self, data):
        if self._in_title:
            self._title_buf.append(data)
        if self._in_jsonld:
            self._jsonld_buf.append(data)

    def one(self, key: str) -> str | None:
        v = self.meta.get(key)
        return v[0] if v else None

    def article(self) -> dict | None:
        for j in self.jsonld:
            try:
                o = json.loads(j)
            except json.JSONDecodeError:
                continue
            if isinstance(o, dict) and o.get("@type") == "Article":
                return o
        return None


def parse_page(body: bytes) -> PageParser:
    p = PageParser()
    p.feed(body.decode("utf-8", "replace"))
    p.close()
    return p


# ---------------------------------------------------------------------------------------------------- sweep
ON_DEMAND = [  # (path, expected status, what)
    ("/blog/zzz-not-a-post-bm05", 404, "unknown post"),
    ("/blog/tag/zzz-not-a-tag-bm05", 200, "unknown tag (soft-200, BM-15 Q2)"),
    ("/blog/th/th", 404, "middleware 404 target"),
]


def gone_rows(repo: Path) -> list[tuple[str, int, str]]:
    p = repo / "src" / "lib" / "prune" / "prune-map.json"
    if not p.exists():
        return []
    m = json.loads(p.read_text(encoding="utf-8")).get("posts") or {}
    for key, e in sorted(m.items()):
        if (e or {}).get("kind") == "gone":
            loc, slug = key.split("/", 1)
            return [(f"/blog/api/gone?locale={loc}&slug={slug}", 410, f"gone {key}")]
    return []


def expected_url(r: dict, mode: str) -> str:
    return r["legacy_url"] if mode == "off" else r["new_url"]


def expected_alts(d: dict, r: dict, mode: str) -> dict[str, str] | None:
    if r["locale_set"] != "th+en":
        return None
    th = d["idx"][(r["kind"], "th", r["value"])]
    en = d["idx"][(r["kind"], "en", r["value"])]
    return {"th": expected_url(th, mode), "en": expected_url(en, mode), "x-default": expected_url(th, mode)}


def cmd_sweep(a) -> int:
    t0 = time.time()
    mode = a.mode
    rep = Report("sweep", a.label)
    for h in C.header(f"bm05.py sweep --mode {mode}"):
        rep.info(h)
    target = a.target.rstrip("/")
    base = a.base.rstrip("/") if a.base else None
    net = Net(target, base)
    d = compute_data(a.repo, SITE)
    lr = d["lr"]
    legacy_origin = lr["legacy_origin"]
    rep.info(f"# target {target} · base {base} · mode {mode} · repo {a.repo}")
    rep.info("# data: " + data_summary(d))

    # ---- sitemap (AC4)
    st, sh, sbody = net.get(target, BASE + "/sitemap.xml")
    lint_ok, lint_msg = xmllint_ok(sbody) if st == 200 else (False, f"status {st}")
    locs: list[str] = []
    if st == 200 and lint_ok:
        root = ET.fromstring(sbody)
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        locs = [(e.text or "").strip() for e in root.findall("s:url/s:loc", ns)]
    dup = len(locs) - len(set(locs))
    ctype = dict(sh).get("content-type", "")
    rep.info(f"# sitemap status {st} · content-type {ctype} · xmllint {lint_msg} · <loc> {len(locs)} · dup {dup}")

    # ---- map every <loc> to a local path (origin substitution) and a data row
    plan = []  # (loc, row | None, fetch path | None, why-not-fetched)
    unexpected = 0
    unmapped = 0
    for loc in locs:
        if mode == "off":
            if loc.startswith(legacy_origin + "/") or loc == legacy_origin:
                r = d["by_legacy"].get(loc)
                if r is None:
                    unmapped += 1
                    plan.append((loc, None, None, "legacy loc not in data"))
                else:
                    plan.append((loc, r, path_query(r["new_url"]), ""))
            else:
                unexpected += 1
                plan.append((loc, d["by_legacy"].get(loc), None, "unexpected origin"))
        else:
            if loc.startswith(SITE + "/"):
                r = d["by_new"].get(loc)
                if r is None:
                    unmapped += 1
                plan.append((loc, r, loc[len(SITE):], "" if r else "loc not in data (fetched)"))
            else:
                unexpected += 1
                plan.append((loc, None, None, "unexpected origin"))

    # ---- fetch + parse
    pages = []
    for loc, r, path, why in plan:
        rec = {"loc": loc, "row": r, "path": path, "why": why, "status": None, "hdrs": [], "p": None, "bp": None}
        if path is not None:
            s, h, b = net.get(target, path)
            rec.update(status=s, hdrs=h, p=parse_page(b) if s == 200 else None)
            if base and s == 200:  # AC12: the same new path on --base (title / description byte-equal)
                bs, _bh, bb = net.get(base, path)
                rec["bp"] = parse_page(bb) if bs == 200 else None
        pages.append(rec)
    on_demand = []
    for path, want, what in ON_DEMAND + gone_rows(a.repo):
        s, h, b = net.get(target, path)
        on_demand.append({"path": path, "want": want, "what": what, "status": s, "hdrs": h,
                          "p": parse_page(b) if s == 200 else None})

    # ---- per-page checks
    n = len(pages)
    fetched = [x for x in pages if x["p"] is not None]
    canon_ok = 0
    hre_ok = hre_presence_ok = olalt_ok = 0
    with_alts = 0
    link_hreflang = 0
    loc200 = sum(1 for x in pages if x["status"] == 200)
    loc3xx = sum(1 for x in pages if x["status"] is not None and 300 <= x["status"] < 400)
    forbidden = [re.compile(x) for x in (json.loads(C.URL_RULES.read_text())["checks"]["dest_forbidden_regex"])]
    shape_bad = []
    observed_alts: dict[str, dict[str, str]] = {}
    canon_set: set[str] = set()
    url_field_newhost = 0  # mode off: SITE+/blog in canonical/og:url/JSON-LD url/hreflang/<loc>
    # T5 fields
    img_ok = 0
    img_unexpected = 0
    asset_hits = 0
    img_on_site = 0
    img_urls: dict[str, str] = {}  # distinct image URL -> template (cover | og:<kind>)
    rss_ok = foot_ok = 0
    slash_feed = 0  # href="/feed.xml" (root-relative, outside the basePath)
    meta_noindex = 0
    hdr_noindex = 0
    title_ok = desc_ok = 0
    rows_out = []
    for x in pages:
        r, p = x["row"], x["p"]
        reasons = []
        want = expected_url(r, mode) if r else None
        links = hvals(x["hdrs"], "link")
        if any("hreflang" in v.lower() for v in links):
            link_hreflang += 1
        canon = og_url = tw_url = ld_url = None
        alts: dict[str, str] = {}
        dup_alts = 0
        olalt: list[str] = []
        if p is None:
            reasons.append(x["why"] or f"status {x['status']}")
        else:
            canon = p.canonical[0] if len(p.canonical) == 1 else None
            if len(p.canonical) != 1:
                reasons.append(f"canonical count {len(p.canonical)}")
            og_url, tw_url = p.one("og:url"), p.one("twitter:url")
            art = p.article()
            ld_url = art.get("url") if art else None
            for lang, href in p.hreflang:
                if lang in alts:
                    dup_alts += 1
                alts[lang] = href
            olalt = p.meta.get("og:locale:alternate", [])
            if canon:
                canon_set.add(canon)
                observed_alts[canon] = alts
        if p is not None and r is not None:
            # AC1 / AC10: canonical = og:url = twitter:url (if present) = <loc> = expected; post JSON-LD url too
            if canon != want:
                reasons.append("canonical != expected")
            if og_url != want:
                reasons.append("og:url != expected")
            if tw_url is not None and tw_url != want:
                reasons.append("twitter:url != expected")
            if x["loc"] != want:
                reasons.append("<loc> != expected")
            if r["kind"] == "post" and ld_url != want:
                reasons.append("JSON-LD url != expected")
            if mode != "off" and canon:
                cpath = canon[len(SITE):] if canon.startswith(SITE) else None
                if (cpath is None or not (cpath == BASE or cpath.startswith(BASE + "/"))
                        or any(f.search(cpath) for f in forbidden)
                        or (r["locale"] == "en" and not (cpath == BASE + "/en" or cpath.startswith(BASE + "/en/")))):
                    shape_bad.append(canon)
                    reasons.append("canonical shape")
            if mode == "off":
                for v in [canon, og_url, ld_url, *alts.values(), x["loc"]]:
                    if v and v.startswith(SITE + BASE):
                        url_field_newhost += 1
            if not [z for z in reasons if z.startswith(("canonical", "og:url", "twitter", "<loc>", "JSON-LD"))]:
                canon_ok += 1
            # AC2: hreflang only for real counterparts; exactly th, en, x-default (= th)
            ea = expected_alts(d, r, mode)
            has = bool(alts)
            with_alts += has
            if has == (ea is not None):
                hre_presence_ok += 1
            else:
                reasons.append("hreflang presence")
            if (ea or {}) == alts and dup_alts == 0:
                hre_ok += 1
            elif has == (ea is not None):
                reasons.append("hreflang values")
            want_olalt = [OG_LOCALE["en" if r["locale"] == "th" else "th"]] if ea else []
            if olalt == want_olalt:
                olalt_ok += 1
            else:
                reasons.append("og:locale:alternate")
        og_img = tw_img = ld_img = None
        rss_href = foot_href = ""
        xrt = [v for v in hvals(x["hdrs"], "x-robots-tag")]
        mrob: list[str] = []
        if p is not None:
            art = p.article()
            og_img, tw_img = p.one("og:image"), p.one("twitter:image")
            ld_img = art.get("image") if art else None
            # AC7: og:image = twitter:image (= post JSON-LD image) on SITE + basePath, never the asset host (ADR-01 09)
            if r is not None:
                if r["kind"] == "post":
                    want_img = SITE + r["cover"] if r.get("cover") else None
                else:
                    want_img = f"{SITE}{BASE}/api/og?title={enc(p.one('og:title') or '')}&locale={r['locale']}"
                fields = [og_img, tw_img] + ([ld_img] if r["kind"] == "post" else [])
                if want_img and all(v == want_img for v in fields):
                    img_ok += 1
                else:
                    reasons.append("image fields")
                if og_img and og_img.startswith(SITE + BASE + "/"):
                    img_on_site += 1
                    img_urls.setdefault(og_img, "cover" if r["kind"] == "post" else f"og:{r['kind']}")
                elif og_img:
                    img_unexpected += 1
                if a.asset_origin:
                    asset_hits += sum(1 for v in fields if v and v.startswith(a.asset_origin.rstrip("/")))
            # AC5: RSS <link> + footer RSS <a> resolve (against the page) to BASE/feed.xml
            rss_href = p.rss[0] if p.rss else ""
            feeds = [an.get("href", "") for an in p.anchors if an.get("title") == "RSS Feed"]
            foot_href = feeds[0] if feeds else ""
            slash_feed += sum(1 for v in p.rss + [an.get("href", "") for an in p.anchors] if v == "/feed.xml")
            page_url = target + (x["path"] or "/")
            if len(p.rss) == 1 and path_of_ref(page_url, rss_href, target) == BASE + "/feed.xml":
                rss_ok += 1
            else:
                reasons.append("rss link")
            if len(feeds) == 1 and path_of_ref(page_url, foot_href, target) == BASE + "/feed.xml":
                foot_ok += 1
            else:
                reasons.append("footer rss")
            # AC8: noindex meta + header
            mrob = p.meta.get("robots", [])
            meta_noindex += any("noindex" in v.lower() for v in mrob)
            hdr_noindex += any("noindex" in v.lower() for v in xrt)
            # AC12: <title> + description byte-equal vs --base
            if x["bp"] is not None:
                title_ok += p.title == x["bp"].title and p.title is not None
                desc_ok += p.meta.get("description") == x["bp"].meta.get("description")
        rows_out.append([x["path"] or "", x["loc"], x["status"] or "", r["kind"] if r else "", r["locale"] if r else "",
                         canon or "", og_url or "", tw_url or "", ld_url or "", json.dumps(alts, ensure_ascii=False),
                         "|".join(olalt), len([v for v in links if "hreflang" in v.lower()]),
                         og_img or "", tw_img or "", ld_img or "", rss_href, foot_href, "|".join(mrob), len(xrt),
                         "OK" if not reasons else "; ".join(reasons)])

    # ---- reciprocity (A lists B ⇔ B lists A), hreflang hrefs ⊆ sitemap set
    loc_set = set(locs)
    edges = {(u, h) for u, al in observed_alts.items() for k, h in al.items() if k in ("th", "en") and h != u}
    nonrecip = sorted((u, h) for u, h in edges if (h, u) not in edges)
    href_not_in_sitemap = sorted({h for al in observed_alts.values() for h in al.values() if h not in loc_set})

    # ---- report
    rep.info("")
    canon_present = sum(1 for x in pages if x["p"] is not None and len(x["p"].canonical) == 1)
    rep.info(f"INFO canonical present (exactly one <link rel=canonical>) {canon_present}/{n} · fetched {len(fetched)}/{n}")
    rep.check(unexpected == 0, f"unexpected origin {unexpected}/{n} (never fetched)")
    rep.check(unmapped == 0, f"<loc> not in data {unmapped}/{n}")
    data_set = {expected_url(r, mode) for r in d["rows"]}
    eq = [canon_set == loc_set, loc_set == data_set, canon_set == data_set]
    rep.check(canon_ok == n and n > 0 and all(eq) and not shape_bad,
              f"canonical rows {canon_ok}/{n} {'PASS' if canon_ok == n and n else 'FAIL'} · set-equality {sum(eq)}/3"
              f" (canonical=loc {eq[0]} · loc=data {eq[1]} · canonical=data {eq[2]}) · shape bad {len(shape_bad)}")
    for u in sorted(data_set - loc_set)[:10]:
        rep.info(f"  data-not-in-sitemap {u}")
    for u in sorted(loc_set - data_set)[:10]:
        rep.info(f"  sitemap-not-in-data {u}")
    rep.check(hre_ok == n and n > 0 and with_alts == d["paired"] and n - with_alts == d["unpaired"],
              f"hreflang {hre_ok}/{n} {'PASS' if hre_ok == n and n else 'FAIL'} · with {with_alts} / without "
              f"{n - with_alts} vs data {d['paired']} / {d['unpaired']}")
    rep.check(hre_presence_ok == n and n > 0,
              f"hreflang presence (alternates iff the data pairs the page) {hre_presence_ok}/{n} · failing "
              f"{n - hre_presence_ok} (data unpaired {d['unpaired']})")
    rep.check(not nonrecip and not href_not_in_sitemap,
              f"hreflang reciprocity {'PASS' if not nonrecip else f'FAIL {len(nonrecip)}'} · hrefs not in sitemap "
              f"{len(href_not_in_sitemap)}")
    for u, h in nonrecip[:5]:
        rep.info(f"  non-reciprocal {u} → {h}")
    rep.check(olalt_ok == n and n > 0, f"og:locale:alternate {olalt_ok}/{n}")
    rep.check(link_hreflang == 0, f"link-hreflang {link_hreflang}/{len(fetched)} (responses with a hreflang Link header)")
    rep.check(len(locs) == d["n"] and lint_ok and dup == 0 and loc200 == len(locs) and loc3xx == 0 and st == 200,
              f"sitemap count {len(locs)} {'=' if len(locs) == d['n'] else '≠'} expected {d['n']} (source posts.json@"
              f"{d['posts_sha'][:16]}) · xmllint {'ok' if lint_ok else lint_msg} · dup {dup} · loc 200 {loc200}/{len(locs)}"
              f" · 3xx {loc3xx}")
    od_ok = all(o["status"] == o["want"] for o in on_demand)
    rep.check(od_ok, "on-demand " + " · ".join(f"{o['path']} {o['status']} (want {o['want']})" for o in on_demand))

    # ---- AC5 rss: the feed the pages point at answers 200
    fs, fh, _fb = net.get(target, BASE + "/feed.xml")
    rep.check(rss_ok == n and foot_ok == n and n > 0 and slash_feed == 0 and fs == 200,
              f"rss-link {rss_ok}/{n} → {BASE}/feed.xml {fs} · footer-rss {foot_ok}/{n} · \"/feed.xml\" hrefs {slash_feed}")

    # ---- AC7 images: every distinct cover + one api/og per template, origin-substituted, 200 image/*, no redirect
    picks: dict[str, str] = {}
    for u, tmpl in img_urls.items():
        if tmpl == "cover" or tmpl not in picks.values():
            picks[u] = tmpl
    fetch_ok, fetch_bad = 0, []
    extra_hdrs: list[tuple[str, int, list[str]]] = []  # (what, status, x-robots-tag lines) for AC8 "extra"
    for u, tmpl in sorted(picks.items(), key=lambda kv: kv[1]):
        s, h, _b = net.get(target, path_query(u))
        ct = dict(h).get("content-type", "")
        if s == 200 and ct.startswith("image/"):
            fetch_ok += 1
        else:
            fetch_bad.append(f"{tmpl} {u} → {s} {ct}")
        if tmpl == "cover" and not any(w == "cover" for w, _, _ in extra_hdrs) or (
                tmpl.startswith("og:") and not any(w.startswith("og:") for w, _, _ in extra_hdrs)):
            extra_hdrs.append((tmpl, s, hvals(h, "x-robots-tag")))
    tmpls = sorted({t for t in picks.values() if t != "cover"})
    rep.check(img_ok == n and n > 0 and img_unexpected == 0 and fetch_ok == len(picks) and len(picks) > 0,
              f"og {img_ok}/{n} {'PASS' if img_ok == n and n else 'FAIL'} · on {SITE}{BASE}/ {img_on_site}/{n} · "
              f"unexpected origin {img_unexpected} (never fetched) · fetch {fetch_ok}/{len(picks)} 200 image/* "
              f"(covers {sum(1 for t in picks.values() if t == 'cover')} + og templates {','.join(tmpls)})")
    for z in fetch_bad[:5]:
        rep.info(f"  image {z}")
    if mode == "asset":
        rep.check(asset_hits == 0, f"asset-origin hits {asset_hits} in og:image / twitter:image / JSON-LD image "
                                   f"(asset origin {a.asset_origin})")

    # ---- AC8 noindex: meta + X-Robots-Tag
    rs, rh, _rb = net.get(target, BASE + "/robots.txt")
    extra_hdrs = [("sitemap", st, hvals(sh, "x-robots-tag")), ("feed", fs, hvals(fh, "x-robots-tag")),
                  ("robots", rs, hvals(rh, "x-robots-tag"))] + extra_hdrs
    if mode == "noindex":
        extra_ok = sum(1 for _w, _s, v in extra_hdrs if any("noindex" in z.lower() for z in v))
        od_meta = sum(1 for o in on_demand if o["p"] is not None and any("noindex" in v.lower() for v in o["p"].meta.get("robots", [])))
        rep.check(meta_noindex == n and hdr_noindex == n and n > 0 and extra_ok == len(extra_hdrs) == 5,
                  f"noindex meta {meta_noindex}/{n} · header {hdr_noindex}/{n} · extra {extra_ok}/{len(extra_hdrs)} "
                  f"({', '.join(w for w, _s, _v in extra_hdrs)}) · on-demand 200 meta {od_meta}")
    else:
        resp = [(x["status"], hvals(x["hdrs"], "x-robots-tag")) for x in pages if x["status"] is not None]
        resp += [(o["status"], hvals(o["hdrs"], "x-robots-tag")) for o in on_demand]
        resp += [(s, v) for _w, s, v in extra_hdrs]
        excepted = sum(1 for s, v in resp if s in (404, 410) and v)
        hdr_other = sum(1 for s, v in resp if s not in (404, 410) and v)
        rep.check(meta_noindex == 0 and hdr_other == 0,
                  f"noindex meta {meta_noindex}/{n} · header {hdr_other} (404/410 excepted: {excepted}) · "
                  f"responses {len(resp)}")

    # ---- AC12 title / description vs --base
    if base:
        rep.check(title_ok == n and desc_ok == n and n > 0,
                  f"title {title_ok}/{n} · description {desc_ok}/{n} byte-equal vs {base}")

    if mode == "off":
        R = C.rules()
        M = C.urlmap()
        rt_ok, rt_bad, ids = 0, [], {}
        for x in pages:  # the page's emitted canonical must map back to the page it was emitted by
            r, p = x["row"], x["p"]
            u = p.canonical[0] if p is not None and len(p.canonical) == 1 else None
            if u is None:
                rt_bad.append(f"{x['loc']} → no canonical")
                continue
            try:
                res = M.explain(u, R, "i")
            except Exception as e:  # noqa: BLE001
                rt_bad.append(f"{u} → {type(e).__name__}")
                continue
            ids[res.rule_id] = ids.get(res.rule_id, 0) + 1
            if r is not None and res.dest == r["new_url"] and ALLOWED.match(res.rule_id):
                rt_ok += 1
            else:
                rt_bad.append(f"{u} → {res.dest} via {res.rule_id}")
        rep.check(rt_ok == n and n > 0, f"round-trip {rt_ok}/{n} (canonical → urlmap mode i → the page; allowed rule "
                                        f"ids) · rule ids {json.dumps(dict(sorted(ids.items())))}")
        for z in rt_bad[:10]:
            rep.info(f"  round-trip {z}")
        bl_p = Path(a.baseline)
        import html as H
        baseline = {H.unescape(ln.strip()) for ln in bl_p.read_text(encoding="utf-8").splitlines() if ln.strip()}
        named = set()
        if a.named_diff:
            named = {ln.strip() for ln in Path(a.named_diff).read_text(encoding="utf-8").splitlines() if ln.strip()}
        only_bl, only_br = sorted(baseline - loc_set), sorted(loc_set - baseline)
        unnamed = [u for u in only_bl + only_br if u not in named]
        rep.check(not unnamed,
                  f"sitemap set = baseline ({len(loc_set)} vs {len(baseline)} · only-baseline {len(only_bl)} · "
                  f"only-branch {len(only_br)} · named diffs {len(only_bl) + len(only_br) - len(unnamed)} · unnamed "
                  f"{len(unnamed)}) [baseline {bl_p.name} sha256 {sha(bl_p)[:16]}]")
        rep.check(loc_set == canon_set,
                  f"canonical set = sitemap set ({len(canon_set)} vs {len(loc_set)} · canonical-only "
                  f"{len(canon_set - loc_set)} · sitemap-only {len(loc_set - canon_set)})")
        for u in only_bl[:10]:
            rep.info(f"  only-baseline {u}")
        for u in only_br[:10]:
            rep.info(f"  only-branch {u}")
        rep.check(url_field_newhost == 0, f"{SITE}{BASE} in URL fields {url_field_newhost} "
                                          "(canonical / og:url / JSON-LD url / hreflang / <loc>)")

    p_tsv = C.write_tsv(f"bm05-sweep-{a.label}", [f"# bm05.py sweep --mode {mode} · target {target}"],
                        ["path", "loc", "status", "kind", "locale", "canonical", "og_url", "twitter_url", "jsonld_url",
                         "hreflang", "og_locale_alternate", "link_hreflang_lines", "og_image", "twitter_image",
                         "jsonld_image", "rss_href", "footer_rss_href", "meta_robots", "x_robots_tag_lines", "result"],
                        rows_out,
                        [f"on-demand {o['path']} {o['status']}" for o in on_demand])
    rep.info(f"per-page {p_tsv}")
    rep.check(net.nonlocal_requests == 0, f"non-local requests {net.nonlocal_requests} · requests {net.requests} · "
                                          f"{time.time() - t0:.0f}s")
    return rep.finish()


# ---------------------------------------------------------------------------------------------------- feed
ATOM = "{http://www.w3.org/2005/Atom}"
W3C_FEED = "https://validator.w3.org/feed/check.cgi"


def cmd_feed(a) -> int:
    rep = Report("feed", a.label)
    for h in C.header(f"bm05.py feed --mode {a.mode}"):
        rep.info(h)
    target = a.target.rstrip("/")
    net = Net(target)
    d = compute_data(a.repo, SITE)
    lr = d["lr"]
    mode = a.mode
    rep.info(f"# target {target} · mode {mode} · data: " + data_summary(d))
    s, h, body = net.get(target, BASE + "/feed.xml")
    ct = dict(h).get("content-type", "")
    saved = C.evidence_path(f"bm05-feed-{a.label}-body", "xml")
    saved.write_bytes(body)
    rep.info(f"# saved {saved} ({len(body)} bytes)")
    lint_ok, lint_msg = xmllint_ok(body) if s == 200 else (False, f"status {s}")
    rep.check(s == 200 and ct == "application/rss+xml; charset=utf-8" and lint_ok,
              f"feed status {s} · content-type {ct!r} · xmllint {lint_msg}")
    items: list[tuple[str, str, str]] = []
    ch_link = self_href = None
    if lint_ok:
        ch = ET.fromstring(body).find("channel")
        ch_link = (ch.findtext("link") or "").strip()
        al = ch.find(f"{ATOM}link")
        self_href = al.get("href") if al is not None else None
        for it in ch.findall("item"):
            g = it.find("guid")
            items.append(((it.findtext("link") or "").strip(), (g.text or "").strip() if g is not None else "",
                          g.get("isPermaLink", "") if g is not None else ""))
    want_home = expected_url(d["idx"][("home", "th", "")], mode)
    want_self = (lr["legacy_origin"] + lr["routes"]["files"]["feed"]) if mode == "off" else SITE + BASE + "/feed.xml"
    rep.check(ch_link == want_home, f"channel <link> {ch_link} (want {want_home})")
    rep.check(self_href == want_self, f"atom:link self {self_href} (want {want_self})")
    want_seq = [(p["locale"], p["slugAsParams"]) for p in d["feed"]]
    want_urls = [expected_url(d["idx"][("post", lo, sl)], mode) for lo, sl in want_seq]
    got_seq = []
    for link, _g, _p in items:
        r = d["by_new"].get(link) or d["by_legacy"].get(link)
        if r is None:  # today's shape (SITE_URL + permalink): /<locale>/blog/<slug> on any origin
            m = re.search(r"/(th|en)/blog/([^/?#]+)$", link)
            got_seq.append((m.group(1), m.group(2)) if m else ("?", link))
        else:
            got_seq.append((r["locale"], r["value"]))
    order_ok = sum(1 for g, w in zip(got_seq, want_seq) if g == w)
    rep.check(order_ok == len(want_seq) == len(items), f"items {order_ok}/{len(want_seq)} (data top-20 order; got {len(items)})")
    url_ok = sum(1 for (link, g, pl), w in zip(items, want_urls) if link == w and g == link and pl == "true")
    rep.check(url_ok == len(want_urls) == len(items),
              f"item <link> = <guid isPermaLink=true> = expected URL {url_ok}/{len(want_urls)}")
    st, _sh, sbody = net.get(target, BASE + "/sitemap.xml")
    locs = set()
    if st == 200:
        locs = {(e.text or "").strip() for e in ET.fromstring(sbody).iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")}
    in_set = sum(1 for link, _g, _p in items if link in locs)
    rep.check(in_set == len(items) and items, f"item links ∈ sitemap set {in_set}/{len(items)}")
    if mode == "off":
        newhost = sum(1 for v in [ch_link, self_href] + [i[0] for i in items] if v and v.startswith(SITE + BASE))
        rep.check(newhost == 0, f"{SITE}{BASE} in feed links {newhost}")
    if a.validate:
        resp = C.evidence_path(f"bm05-feed-{a.label}-w3c", "xml")
        r = subprocess.run(["curl", "-s", "--max-time", "90", "--data-urlencode", f"rawdata@{saved}",
                            "--data", "output=soap12", W3C_FEED], capture_output=True)
        resp.write_bytes(r.stdout)
        txt = r.stdout.decode("utf-8", "replace")
        validity = (re.search(r"<m:validity>(\w+)</m:validity>", txt) or [None, None])[1]
        errors = (re.search(r"<m:errorcount>(\d+)</m:errorcount>", txt) or [None, "?"])[1]
        warnings = (re.search(r"<m:warningcount>(\d+)</m:warningcount>", txt) or [None, "?"])[1]
        wtypes = sorted(set(re.findall(r"<m:warning>.*?<type>([^<]+)</type>", txt, re.S)))
        rep.info(f"# W3C request 1 (declared external call: POST rawdata to {W3C_FEED}, curl exit {r.returncode}) · "
                 f"response {resp} ({len(r.stdout)} bytes)")
        rep.check(validity == "true", f"validator validity={validity} (errors {errors} · warnings {warnings}"
                                      f"{' · ' + ', '.join(wtypes) if wtypes else ''})")
    rep.check(net.nonlocal_requests == 0, f"non-local requests {net.nonlocal_requests} (blog) · requests {net.requests}")
    return rep.finish()


# ---------------------------------------------------------------------------------------------------- robots
ROOT_ROBOTS = "User-agent: *\nAllow: /\nSitemap: https://dopelab.studio/blog/sitemap.xml\n"  # ADR-01 07, byte for byte


def diff_lines(a_text: str, b_text: str) -> int:
    import difflib
    minus = plus = 0
    for ln in difflib.unified_diff(a_text.splitlines(), b_text.splitlines(), lineterm="", n=0):
        if ln.startswith("-") and not ln.startswith("---"):
            minus += 1
        elif ln.startswith("+") and not ln.startswith("+++"):
            plus += 1
    return max(minus, plus)


def cmd_robots(a) -> int:
    rep = Report("robots", a.label)
    for h in C.header(f"bm05.py robots --mode {a.mode}"):
        rep.info(h)
    target = a.target.rstrip("/")
    net = Net(target)
    lr = json.loads((a.repo / "src" / "lib" / "legacy-routes.json").read_text(encoding="utf-8"))
    s, h, body = net.get(target, BASE + "/robots.txt")
    ct = dict(h).get("content-type", "")
    text = body.decode("utf-8", "replace")
    rep.info(f"# {target}{BASE}/robots.txt → {s} {ct!r} · {len(body)} bytes:")
    for ln in text.splitlines():
        rep.info(f"#   {ln}")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    kv = [(ln.split(":", 1)[0].strip().lower(), ln.split(":", 1)[1].strip()) for ln in lines if ":" in ln]
    want_sm = (lr["legacy_origin"] + lr["routes"]["files"]["sitemap"]) if a.mode == "off" else SITE + BASE + "/sitemap.xml"
    sm = [v for k, v in kv if k == "sitemap"]
    dis = [v for k, v in kv if k == "disallow" and v]
    ok = (s == 200 and ct.startswith("text/plain") and ("user-agent", "*") in kv and ("allow", "/") in kv and not dis
          and sm == [want_sm])
    rep.check(ok, f"robots 200 text/plain · User-Agent * · Allow / · Disallow with a path {len(dis)} · Sitemap: "
                  f"{' '.join(sm) or '-'} (want {want_sm})")
    srv = a.dopelab / "deliverables" / "blog-migration" / "server"
    ink_fx, root_fx = srv / "ink-robots.txt", srv / "robots.txt"
    d_ink = diff_lines(ink_fx.read_text(encoding="utf-8"), text) if ink_fx.exists() else -1
    d_root = diff_lines(ROOT_ROBOTS, root_fx.read_text(encoding="utf-8")) if root_fx.exists() else -1
    byte_root = root_fx.exists() and root_fx.read_bytes() == ROOT_ROBOTS.encode()
    byte_ink = ink_fx.exists() and ink_fx.read_bytes() == body
    if a.mode == "off":
        rep.info(f"INFO diff ink-robots {d_ink} (normal-mode fixture; mode off is not judged against it)")
    else:
        rep.check(d_ink == 0 and byte_ink, f"diff ink-robots {d_ink} (byte-equal {byte_ink}) vs {ink_fx}")
    rep.check(d_root == 0 and byte_root, f"diff root {d_root} (byte-equal {byte_root}) vs ADR-01 07 body · {root_fx}")
    rep.info(f"robots {'PASS' if rep.fails == 0 else 'FAIL'} · diff ink-robots {d_ink} · diff root {d_root}")
    rep.check(net.nonlocal_requests == 0, f"non-local requests {net.nonlocal_requests} · requests {net.requests}")
    return rep.finish()


# ---------------------------------------------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("data")
    p.add_argument("--repo", type=Path, required=True)
    p.add_argument("--prune-counts")
    p.add_argument("--label", default="data")
    p = sub.add_parser("sweep")
    p.add_argument("--target", required=True)
    p.add_argument("--repo", type=Path, required=True)
    p.add_argument("--mode", choices=["normal", "noindex", "off", "asset"], required=True)
    p.add_argument("--base")
    p.add_argument("--asset-origin")
    p.add_argument("--baseline", default=str(Path(os.environ["BM03_DIR"]) / "data" / "ink-sitemap-urls-2026-10-06.txt"))
    p.add_argument("--named-diff")
    p.add_argument("--label", default="sweep")
    p = sub.add_parser("feed")
    p.add_argument("--target", required=True)
    p.add_argument("--repo", type=Path, required=True)
    p.add_argument("--mode", choices=["normal", "off"], default="normal")
    p.add_argument("--validate", action="store_true", help="POST the saved feed to the W3C Feed Validation Service")
    p.add_argument("--label", default="feed")
    p = sub.add_parser("robots")
    p.add_argument("--target", required=True)
    p.add_argument("--dopelab", type=Path, required=True, help="dopelab tree holding deliverables/blog-migration/server/")
    p.add_argument("--repo", type=Path, default=INK, help="ink tree (legacy-routes.json for mode off)")
    p.add_argument("--mode", choices=["normal", "off"], default="normal")
    p.add_argument("--label", default="robots")
    a = ap.parse_args()
    return {"data": cmd_data, "sweep": cmd_sweep, "feed": cmd_feed, "robots": cmd_robots}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
