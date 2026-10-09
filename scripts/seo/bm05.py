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
        rec = {"loc": loc, "row": r, "path": path, "why": why, "status": None, "hdrs": [], "p": None}
        if path is not None:
            s, h, b = net.get(target, path)
            rec.update(status=s, hdrs=h, p=parse_page(b) if s == 200 else None)
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
        rows_out.append([x["path"] or "", x["loc"], x["status"] or "", r["kind"] if r else "", r["locale"] if r else "",
                         canon or "", og_url or "", tw_url or "", ld_url or "", json.dumps(alts, ensure_ascii=False),
                         "|".join(olalt), len([v for v in links if "hreflang" in v.lower()]),
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
                         "hreflang", "og_locale_alternate", "link_hreflang_lines", "result"], rows_out,
                        [f"on-demand {o['path']} {o['status']}" for o in on_demand])
    rep.info(f"per-page {p_tsv}")
    rep.check(net.nonlocal_requests == 0, f"non-local requests {net.nonlocal_requests} · requests {net.requests} · "
                                          f"{time.time() - t0:.0f}s")
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
    a = ap.parse_args()
    return {"data": cmd_data, "sweep": cmd_sweep}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
