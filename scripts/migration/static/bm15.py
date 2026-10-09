#!/usr/bin/env python3.13
"""BM-15 checks: static rendering of the /blog pages (SPEC §5). python3.13 stdlib (+ playwright for `ondemand`).

  python3.13 scripts/migration/static/bm15.py build --repo <tree> --log <build log> \
      [--prefix-origin ORIGIN | --absent STRING] [--label L]
  python3.13 scripts/migration/static/bm15.py headers --target URL [--repo <tree>] [--only all|ac8] [--snapshot F] [--label L]
  python3.13 scripts/migration/static/bm15.py compare --a URL --b URL [--repo <tree>] [--only all|canon|casefold] [--label L]

Every run writes NEW bm15-<sub>-<label>-<HHMMSS>.{txt,tsv} files under $EVIDENCE_DIR (default: the BM-15 story
evidence folder) and ends with "RESULT PASS|FAIL". Exit 0 = PASS. Nothing is ever deleted or modified outside
$EVIDENCE_DIR; ../checks/common.py (BM-04) is imported read-only.

The expected URL set is recomputed from <repo>/.velite/posts.json at run time (non-draft posts + distinct tags +
distinct categories + 4 pages, per locale), so a content prune (BM-16) is followed automatically.

build (AC1, AC5 filesystem line, AC10a/b file scans). Run right after `npm run build`, BEFORE `next start`
(next start writes on-demand pages into .next/server/app).
  (a) "Route (app)" table: the 7 /[locale]… page routes must be ● or ○.
  (b) ƒ only on /api/* (newsletter, og), /feed.xml and the "ƒ Proxy (Middleware)" line.
  (c) .next/prerender-manifest.json: the [locale] keys number exactly N, and every expected key is present.
  (d) .next/server/app/{th,en}/**/*.html + th.html/en.html: N distinct files; uname + filesystem personality
      (a case-insensitive volume would fold the 18 case-fold tag pairs into one file: REQ F9 / D9).
  (e) the build log has no dynamic-usage line (Dynamic server usage, DYNAMIC_SERVER_USAGE, used `headers`,
      bailed out, couldn't be rendered statically, opts into dynamic rendering).
  --prefix-origin ORIGIN (B2′, prefix ON): html_files / with_prefix (files containing ORIGIN) / root_relative_next
      (files containing src="/blog/_next/"). PASS = with_prefix == html_files and root_relative_next == 0.
  --absent STRING (B2, prefix OFF): occurrences of STRING under .next/static + .next/server (prerendered
      .html/.rsc/.meta included). PASS = 0.
  Also writes bm15-build-<label>-expected-<HHMMSS>.tsv (public_path, predicted_key) and
  bm15-build-<label>-html-<HHMMSS>.txt (the .next/server/app *.html list, the snapshot `headers` can diff against).

headers (AC1 runtime, AC2, AC8). Run FIRST after `next start` (a first GET must be the prerendered entry).
  (i) every expected path once: 200 + `x-nextjs-cache: HIT`. Calibrated on /blog/about first; if that header is
      absent the FALLBACK discriminator is used and said: every expected key has a prerendered .html before the run
      and 0 new .html files appear for expected URLs (an on-demand render writes a new, non-predicted file).
  (ii) S18 × {plain, Accept-Language: en-US, Cookie: NEXT_LOCALE=en} × 2 and (iii) RSC: 1 on the ADR post × 2:
      200 · cache-control with s-maxage= and no private/no-store/no-cache · no set-cookie · vary without * / cookie.
  (iv) AC8: /blog/api/og 200 image/png · POST /blog/api/newsletter {"email":"x"} 400 {"error":"Invalid email"} ·
      4 × 404 (unknown post, /blog/th/th, /blog/th/<post>, /blog/EN/<post>). `--only ac8` runs (iv) alone (B1 side).
  (v) recorded, not judged: the unknown tag and the unknown post, twice each, + new .html files they leave.

compare (AC4a/b, AC5, AC6, AC8 rows). Pages = the N expected paths + the unknown post + the unknown tag.
  Per page, A vs B: equal status and byte-equal fields from the whole document (html lang, title, meta description,
  canonical, alternate hreflang, og:*/twitter:*, JSON-LD, whitespace-normalised <main> text, multiset of <a href> +
  <img src> in <body> without /_next/static/* and with the build id masked). On B every metadata tag is in <head>
  (F11). S18: the `link` response headers are byte-equal. AC5: every case-fold tag URL is 200, its <main> <h1> is
  the exact tag, its post links are exactly the posts with that exact tag, and its fields equal A. AC6: every tag +
  category page has the same canonical / og:url / hreflang on A and B, none with a raw space or a /tag/<a>/<b> split.
  `--only canon` = AC6 alone (early check on B2′), `--only casefold` = AC5 alone.
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures
import http.client
import json
import os
import platform
import re
import subprocess
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

HERE = Path(__file__).resolve().parent
os.environ.setdefault("EVIDENCE_DIR", str(Path.home() / "Projects/dopelab/ψ/writing/blog-migration/stories/BM-15/evidence"))
sys.path.insert(0, str(HERE.parent / "checks"))
import common as C  # noqa: E402  (BM-04, read-only: evidence_path, stamp, fetch, write_tsv)

PAGES = [("R-HOME", ""), ("R-PAGE", "/all"), ("R-PAGE", "/about"), ("R-PAGE", "/contact")]
S18 = [  # REQ §4 header sample (stories/BM-15/data/s18.tsv): all 18 are BM-04 AC1 contract rows
    "/blog", "/blog/en", "/blog/all", "/blog/en/all", "/blog/anthropic-ipo-350b", "/blog/en/agent-teams-11-ai",
    "/blog/tag/ai", "/blog/tag/Kling%203.0", "/blog/tag/A%2FB-test", "/blog/tag/gpt-5.4",
    "/blog/tag/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%95%E0%B8%A5%E0%B8%B2%E0%B8%94", "/blog/en/tag/karpathy",
    "/blog/category/AI%20News", "/blog/en/category/AI%20Workflow", "/blog/about", "/blog/en/about",
    "/blog/contact", "/blog/en/contact",
]
UNKNOWN_TAG = "/blog/tag/zzz-not-a-tag-bm15"
UNKNOWN_POST = "/blog/zzz-not-a-post-bm15"
RSC_PATH = "/blog/anthropic-ipo-350b"
NOT_FOUND_PATHS = [UNKNOWN_POST, "/blog/th/th", "/blog/th/anthropic-ipo-350b", "/blog/EN/agent-teams-11-ai"]
VARIANTS = [("plain", {}), ("accept-language", {"Accept-Language": "en-US,en;q=0.9"}),
            ("cookie", {"Cookie": "NEXT_LOCALE=en"})]
UA = "bm15-checks/1.0"
WORKERS = 4
PAGE_ROUTES = (
    "/[locale]", "/[locale]/[slug]", "/[locale]/about", "/[locale]/all",
    "/[locale]/category/[category]", "/[locale]/contact", "/[locale]/tag/[tag]",
)
F_ALLOWED = ("/api/newsletter", "/api/og", "/feed.xml")
PROXY = "Proxy (Middleware)"
TOP = re.compile(r"^[┌├└]\s+(\S)\s+(\S+)")
PROXY_RE = re.compile(r"^(\S)\s+Proxy \(Middleware\)\s*$")
DYN_RE = re.compile(r"Dynamic server usage|DYNAMIC_SERVER_USAGE|used `headers`|bailed out|"
                    r"couldn't be rendered statically|opts into dynamic rendering")


# ---------------------------------------------------------------- pure functions (test_bm15.py)

def enc(v: str) -> str:
    """JavaScript encodeURIComponent (unreserved: A-Z a-z 0-9 - _ . ! ~ * ' ( ))."""
    return quote(v, safe="-_.!~*'()")


def esc_delims(v: str) -> str:
    """Next escapePathDelimiters(value, true): / # ? and already-encoded %2f %23 %3f %5c → percent-encoded."""
    out, i = [], 0
    while i < len(v):
        three = v[i:i + 3].lower()
        if three in ("%2f", "%23", "%3f", "%5c"):
            out.append("%25" + v[i + 1:i + 3])
            i += 3
            continue
        ch = v[i]
        out.append({"/": "%2F", "#": "%23", "?": "%3F"}.get(ch, ch))
        i += 1
    return "".join(out)


def public_prefix(loc: str) -> str:
    return "/blog" if loc == "th" else "/blog/en"


def url_to_key(public_path: str) -> str:
    """SPEC §4: strip /blog · no leading /en segment → /th in front · each segment →
    escapePathDelimiters(decodeURIComponent(seg))."""
    p = public_path
    if p == "/blog" or p.startswith("/blog/"):
        p = p[len("/blog"):]
    segs = [s for s in p.split("/") if s]
    if not segs or segs[0] != "en":
        segs = ["th"] + segs
    return "/" + "/".join(esc_delims(unquote(s, errors="strict")) for s in segs)


def expected_rows(posts: list[dict]) -> list[list[str]]:
    """[locale, family, public_path, predicted_key, value] — same rule as data/gen_spec_data.py (spec step)."""
    rows: list[list[str]] = []
    for loc in ("th", "en"):
        ps = [p for p in posts if p.get("locale") == loc and not p.get("draft")]
        tags = list(dict.fromkeys(t for p in ps for t in p.get("tags", [])))
        cats = list(dict.fromkeys(p["category"] for p in ps))
        pre = public_prefix(loc)
        for fam, rest in PAGES:
            rows.append([loc, fam, pre if rest == "" else pre + rest, f"/{loc}{rest}", ""])
        for p in ps:
            s = p["slugAsParams"]
            rows.append([loc, "R-POST", f"{pre}/{enc(s)}", f"/{loc}/{esc_delims(s)}", s])
        for t in tags:
            rows.append([loc, "R-TAG", f"{pre}/tag/{enc(t)}", f"/{loc}/tag/{esc_delims(t)}", t])
        for c in cats:
            rows.append([loc, "R-CAT", f"{pre}/category/{enc(c)}", f"/{loc}/category/{esc_delims(c)}", c])
    return rows


def parse_route_table(text: str) -> dict[str, str]:
    """'Route (app)' block → {route: symbol}; top-level lines only (path sub-lines start with │ or spaces)."""
    table: dict[str, str] = {}
    lines = text.splitlines()
    start = next((i for i, ln in enumerate(lines) if ln.strip() == "Route (app)"), None)
    if start is None:
        return table
    for ln in lines[start + 1:]:
        m = TOP.match(ln)
        if m:
            table[m.group(2)] = m.group(1)
            continue
        m = PROXY_RE.match(ln)
        if m:
            table[PROXY] = m.group(1)
        elif ln.startswith("○  (Static)"):
            break
    return table


def judge_routes(table: dict[str, str]) -> tuple[int, list[str]]:
    """(a) page routes ●/○ · (b) ƒ only where allowed. Returns (routes_f, problems)."""
    problems: list[str] = []
    for r in PAGE_ROUTES:
        if r not in table:
            problems.append(f"missing page route {r}")
        elif table[r] not in ("●", "○"):
            problems.append(f"page route {r} is {table[r]} (want ● or ○)")
    routes_f = 0
    for r, s in table.items():
        if s != "ƒ" or r == PROXY or r in F_ALLOWED or r.startswith("/api/"):
            continue
        routes_f += 1
        if r not in PAGE_ROUTES:
            problems.append(f"ƒ not allowed on {r}")
    return routes_f, problems


FIELDS = ("lang", "title", "description", "canonical", "hreflang", "social", "jsonld", "main_text", "links")
BUILD_ID_RE = re.compile(r'\\"b\\":\\"([A-Za-z0-9_-]{8,})\\"')
WS = re.compile(r"\s+")


class _Doc(HTMLParser):
    """One pass over the whole document: AC4a fields + where each metadata tag sits (F11)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.f: dict = {k: [] for k in FIELDS if k != "main_text"}
        self.f.update(h1_main=[], main_hrefs=[], meta_outside_head=[])
        self.in_head = self.in_body = False
        self.main = 0
        self.skip = 0  # inside <script>/<style> (text not part of <main> text)
        self.ld: list[str] | None = None
        self.title: list[str] | None = None
        self.h1: list[str] | None = None
        self.text: list[str] = []

    def _meta(self, desc: str) -> None:
        if not self.in_head:
            self.f["meta_outside_head"].append(desc)

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if tag == "html" and "lang" in a:
            self.f["lang"].append(a["lang"])
        elif tag == "head":
            self.in_head = True
        elif tag == "body":
            self.in_head, self.in_body = False, True
        elif tag == "main":
            self.main += 1
        elif tag == "title":
            self.title = []
        elif tag == "h1" and self.main:
            self.h1 = []
        elif tag in ("script", "style"):
            self.skip += 1
            if tag == "script" and a.get("type") == "application/ld+json":
                self.ld = []
        if tag == "meta":
            name = a.get("name") or a.get("property") or ""
            if name == "description":
                self.f["description"].append(a.get("content", ""))
                self._meta("meta description")
            elif name.startswith(("og:", "twitter:")):
                self.f["social"].append([name, a.get("content", "")])
                self._meta(f"meta {name}")
        elif tag == "link":
            rel = a.get("rel", "").split()
            if "canonical" in rel:
                self.f["canonical"].append(a.get("href", ""))
                self._meta("link rel=canonical")
            elif "alternate" in rel and "hreflang" in a:
                self.f["hreflang"].append([a["hreflang"], a.get("href", "")])
                self._meta(f"link rel=alternate hreflang={a['hreflang']}")
        if self.in_body:
            if tag == "a" and "href" in a:
                self.f["links"].append(["a", a["href"]])
                if self.main:
                    self.f["main_hrefs"].append(a["href"])
            elif tag == "img" and "src" in a:
                self.f["links"].append(["img", a["src"]])

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag in ("script", "style", "title", "main", "h1"):
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag == "head":
            self.in_head = False
        elif tag == "main" and self.main:
            self.main -= 1
        elif tag == "title" and self.title is not None:
            self.f["title"].append(WS.sub(" ", "".join(self.title)).strip())
            self._meta("title")
            self.title = None
        elif tag == "h1" and self.h1 is not None:
            self.f["h1_main"].append(WS.sub(" ", " ".join(self.h1)).strip())
            self.h1 = None
        elif tag in ("script", "style") and self.skip:
            self.skip -= 1
            if self.ld is not None:
                self.f["jsonld"].append("".join(self.ld))
                self.ld = None

    def handle_data(self, data):
        if self.ld is not None:
            self.ld.append(data)
        if self.title is not None:
            self.title.append(data)
        if self.skip:
            return
        if self.h1 is not None:
            self.h1.append(data)
        if self.main:
            self.text.append(data)


def extract(html_text: str) -> dict:
    """AC4a fields of one document. `links` = sorted multiset of <a href> + <img src> in <body>, without
    /_next/static/* and with the build id replaced (build-hash differences are not content)."""
    d = _Doc()
    d.feed(html_text)
    d.close()
    f = d.f
    f["main_text"] = WS.sub(" ", " ".join(d.text)).strip()
    bids = set(BUILD_ID_RE.findall(html_text))
    links = []
    for kind, v in f["links"]:
        if "/_next/static/" in v:
            continue
        for b in bids:
            v = v.replace(b, "<build>")
        links.append([kind, v])
    f["links"] = sorted(links)
    return f


def diff_fields(a: dict, b: dict) -> list[str]:
    return [k for k in FIELDS if a.get(k) != b.get(k)]


def link_entries(value: str) -> list[str]:
    return [e.strip() for e in re.split(r",\s*(?=<)", value) if e.strip()]


def hvals(hdrs: list[tuple[str, str]], name: str) -> list[str]:
    return [v for k, v in hdrs if k == name]


def hfirst(hdrs: list[tuple[str, str]], name: str) -> str:
    v = hvals(hdrs, name)
    return v[0] if v else ""


def judge_cache(status: int, hdrs: list[tuple[str, str]]) -> tuple[list[str], str]:
    """AC2 per response: 200 · cache-control has s-maxage= and no private/no-store/no-cache · no set-cookie ·
    vary has neither * nor cookie. Returns (problems, s-maxage value)."""
    probs = []
    if status != 200:
        probs.append(f"status {status}")
    cc = ", ".join(hvals(hdrs, "cache-control")).lower()
    m = re.search(r"s-maxage=(\d+)", cc)
    if not m:
        probs.append(f"no s-maxage in cache-control '{cc}'")
    for bad in ("private", "no-store", "no-cache"):
        if re.search(rf"(^|[ ,]){bad}($|[ ,=])", cc):
            probs.append(f"cache-control has {bad}")
    for sc in hvals(hdrs, "set-cookie"):
        probs.append(f"set-cookie: {sc[:60]}")
    vary = ", ".join(hvals(hdrs, "vary")).lower()
    if "*" in vary or "cookie" in vary:
        probs.append(f"vary '{vary}'")
    return probs, (m.group(1) if m else "")


# ---------------------------------------------------------------- helpers

def load_posts(repo: Path) -> list[dict]:
    return json.loads((repo / ".velite" / "posts.json").read_text(encoding="utf-8"))


def git(repo: Path, *args: str) -> str:
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else f"(git {' '.join(args)}: exit {r.returncode})"


def personality(repo: Path) -> str:
    """`diskutil info <mount point of repo> | grep Personality` (diskutil needs the mount point, not a subdir)."""
    df = subprocess.run(["/bin/df", "-P", str(repo)], capture_output=True, text=True).stdout.splitlines()
    mount = df[-1].split(None, 5)[-1] if len(df) > 1 else str(repo)
    r = subprocess.run(["diskutil", "info", mount], capture_output=True, text=True)
    for ln in r.stdout.splitlines():
        if "Personality" in ln:
            return f"{ln.split(':', 1)[1].strip()} (mount {mount})"
    return f"(diskutil info {mount}: exit {r.returncode}, no Personality line)"


def html_list(app: Path) -> list[str]:
    """Prerendered page HTML under .next/server/app: th.html, en.html, th/**/*.html, en/**/*.html."""
    out = []
    for loc in ("th", "en"):
        if (app / f"{loc}.html").is_file():
            out.append(f"{loc}.html")
        d = app / loc
        if d.is_dir():
            out += [str(p.relative_to(app)) for p in d.rglob("*.html") if p.is_file()]
    return sorted(set(out))


def req(base: str, raw_path: str, method: str = "GET", headers: dict | None = None, body: bytes | None = None,
        timeout: float = 120.0) -> tuple[int, list[tuple[str, str]], bytes]:
    """No-follow request, raw path sent byte for byte (as common.fetch), but every header kept (two `link`
    headers stay two) and an optional body. Returns (status, [(lower-case name, value)], body)."""
    u = urlsplit(base)
    conn = http.client.HTTPConnection(u.hostname, u.port or 80, timeout=timeout)
    try:
        conn.putrequest(method, raw_path, skip_host=True, skip_accept_encoding=True)
        conn.putheader("Host", u.netloc)
        conn.putheader("User-Agent", UA)
        conn.putheader("Accept-Encoding", "identity")
        if body is not None:
            conn.putheader("Content-Type", "application/json")
            conn.putheader("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            conn.putheader(k, v)
        conn.endheaders(body)
        r = conn.getresponse()
        data = r.read()
        return r.status, [(k.lower(), v) for k, v in r.getheaders()], data
    finally:
        conn.close()


def fetch_many(base: str, paths: list[str]) -> dict[str, tuple[int, list[tuple[str, str]], bytes]]:
    with concurrent.futures.ThreadPoolExecutor(WORKERS) as ex:
        return dict(zip(paths, ex.map(lambda p: req(base, p), paths)))


def casefold_rows(posts: list[dict]) -> list[list]:
    """AC5: every tag whose case-fold collides with another tag of the same locale →
    [casefold_key, locale, tag, public_path, set of public post paths with exactly that tag]."""
    out = []
    for loc in ("th", "en"):
        ps = [p for p in posts if p.get("locale") == loc and not p.get("draft")]
        tags = list(dict.fromkeys(t for p in ps for t in p.get("tags", [])))
        groups = collections.defaultdict(list)
        for t in tags:
            groups[t.casefold()].append(t)
        pre = public_prefix(loc)
        for key, vals in sorted(groups.items()):
            if len(vals) < 2:
                continue
            for t in vals:
                exact = {f"{pre}/{enc(p['slugAsParams'])}" for p in ps if t in p.get("tags", [])}
                out.append([key, loc, t, f"{pre}/tag/{enc(t)}", exact])
    return out


def named_ac6(rows: list[list[str]]) -> list[list[str]]:
    """SPEC §4 / §10.3 named AC6 rows: every tag/category value with / & . or non-ASCII, + AI News, en AI Workflow."""
    out = []
    for r in rows:
        loc, fam, pub, _key, v = r
        if fam not in ("R-TAG", "R-CAT"):
            continue
        odd = any(ch in v for ch in "/&.") or any(ord(ch) > 127 for ch in v)
        if odd or (fam, loc, v) in (("R-CAT", "th", "AI News"), ("R-CAT", "en", "AI Workflow")):
            out.append(r)
    return out


def report(sub: str, label: str, lines: list[str], ok: bool) -> int:
    lines = lines + [f"RESULT {'PASS' if ok else 'FAIL'}"]
    p = C.evidence_path(f"bm15-{sub}-{label}", "txt")
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"evidence {p}")
    return 0 if ok else 1


def head_lines(sub: str, argv: list[str], repo: Path | None) -> list[str]:
    out = [f"# bm15.py {sub} · {time.strftime('%Y-%m-%d %H:%M:%S %z')} · args {' '.join(argv)}"]
    if repo is not None:
        bid = repo / ".next" / "BUILD_ID"
        out.append(f"# repo {repo} · HEAD {git(repo, 'rev-parse', 'HEAD')} · BUILD_ID "
                   f"{bid.read_text().strip() if bid.exists() else '-'}")
    return out


# ---------------------------------------------------------------- build

def cmd_build(a: argparse.Namespace, argv: list[str]) -> int:
    repo = Path(a.repo).resolve()
    label = a.label or "build"
    lines = head_lines("build", argv, repo) + [f"# log {Path(a.log).resolve()}"]
    ok = True
    rows = expected_rows(load_posts(repo))
    n = len(rows)
    keys = [r[3] for r in rows]

    p_exp = C.evidence_path(f"bm15-build-{label}-expected", "tsv")
    p_exp.write_text("public_path\tpredicted_key\n" + "".join(f"{r[2]}\t{r[3]}\n" for r in rows), encoding="utf-8")
    lines.append(f"expected set (from {repo}/.velite/posts.json): N {n} · distinct keys {len(set(keys))} → {p_exp.name}")
    if len(set(keys)) != n:
        ok = False
        lines.append("FAIL expected keys are not distinct")

    # (a) + (b)
    table = parse_route_table(Path(a.log).read_text(encoding="utf-8", errors="replace"))
    routes_f, problems = judge_routes(table)
    lines.append("route table: " + (" · ".join(f"{s} {r}" for r, s in table.items()) or "(no 'Route (app)' block)"))
    for pr in problems:
        lines.append(f"FAIL (a)/(b) {pr}")
    ok &= not problems

    # (c)
    mf = repo / ".next" / "prerender-manifest.json"
    routes = json.loads(mf.read_text())["routes"] if mf.exists() else {}
    loc_keys = sorted(k for k, v in routes.items() if str((v or {}).get("srcRoute") or "").startswith("/[locale]"))
    missing = [k for k in keys if k not in routes]
    extra = sorted(set(loc_keys) - set(keys))
    lines.append(f"(c) prerender-manifest [locale] keys {len(loc_keys)} · expected keys missing {len(missing)} · "
                 f"unexpected [locale] keys {len(extra)}")
    if missing:
        lines.append("    missing (first 5 predicted): " + " | ".join(missing[:5]))
        lines.append("    manifest [locale] keys (first 5 actual): " + " | ".join(loc_keys[:5]))
    if extra:
        lines.append("    unexpected (first 5): " + " | ".join(extra[:5]))
    ok &= len(loc_keys) == n and not missing

    # (d)
    app = repo / ".next" / "server" / "app"
    html = html_list(app)
    with_file = sum(1 for k in keys if (app / (k.lstrip("/") + ".html")).is_file())
    pers = personality(repo)
    lines.append(f"(d) html files {len(html)} · expected keys with <key>.html {with_file}/{n} (info)")
    lines.append(f"uname -s: {platform.system()} · Personality: {pers}")
    if "case-sensitive" not in pers.lower():
        ok = False
        lines.append("FAIL (d) the tree is not on a case-sensitive filesystem: not valid evidence (REQ D9)")
    ok &= len(html) == n
    p_html = C.evidence_path(f"bm15-build-{label}-html", "txt")
    p_html.write_text("".join(h + "\n" for h in html), encoding="utf-8")
    lines.append(f"    .next/server/app html snapshot → {p_html.name}")

    # (e)
    dyn = [ln for ln in Path(a.log).read_text(encoding="utf-8", errors="replace").splitlines() if DYN_RE.search(ln)]
    lines.append(f"(e) dynamic-usage lines in the build log {len(dyn)}")
    lines += [f"    {ln[:200]}" for ln in dyn[:5]]
    ok &= not dyn

    lines.append(f"routes_f {routes_f} · manifest_paths {len(loc_keys)} · html_files {len(html)} · expected_N {n}")
    ok &= routes_f == 0

    if a.prefix_origin:
        o = a.prefix_origin.rstrip("/")
        with_prefix = root_rel = 0
        for h in html:
            t = (app / h).read_text(encoding="utf-8", errors="replace")
            with_prefix += o in t
            root_rel += 'src="/blog/_next/' in t
        lines.append(f"prefix {o}: html_files {len(html)} · with_prefix {with_prefix} · root_relative_next {root_rel}")
        ok &= len(html) > 0 and with_prefix == len(html) and root_rel == 0
    if a.absent:
        needle = a.absent.encode()
        counts = {}
        for area in ("static", "server"):
            c = files = 0
            for p in (repo / ".next" / area).rglob("*"):
                if p.is_file():
                    k = p.read_bytes().count(needle)
                    c += k
                    files += k > 0
            counts[area] = (c, files)
        total = sum(c for c, _ in counts.values())
        lines.append(f"absent {total} · '{a.absent}' in .next/static {counts['static'][0]} ({counts['static'][1]} files)"
                     f" · .next/server {counts['server'][0]} ({counts['server'][1]} files; prerendered .html/.rsc/.meta included)")
        ok &= total == 0
    return report("build", label, lines, ok)


# ---------------------------------------------------------------- headers

def ac8_rows(base: str) -> tuple[list[str], list[list], bool]:
    """(iv) og 200 image/png · newsletter POST {"email":"x"} 400 {"error":"Invalid email"} · 4 × 404."""
    lines, tsv, ok = [], [], True
    st, hd, body = req(base, "/blog/api/og?title=x&locale=th")
    ct = hfirst(hd, "content-type")
    good = st == 200 and ct.startswith("image/png")
    lines.append(f"{'PASS' if good else 'FAIL'} (iv) og /blog/api/og?title=x&locale=th → {st} {ct} ({len(body)} bytes)")
    tsv.append(["iv", "/blog/api/og?title=x&locale=th", "GET", st, ct, "", good])
    ok &= good
    st, hd, body = req(base, "/blog/api/newsletter", "POST", body=b'{"email":"x"}')
    try:
        js = json.loads(body)
    except ValueError:
        js = None
    good = st == 400 and js == {"error": "Invalid email"}
    lines.append(f"{'PASS' if good else 'FAIL'} (iv) newsletter POST {{\"email\":\"x\"}} → {st} {body[:60]!r}")
    tsv.append(["iv", "/blog/api/newsletter", "POST", st, hfirst(hd, "content-type"), body[:60].decode(errors="replace"), good])
    ok &= good
    for p in NOT_FOUND_PATHS:
        st, hd, _ = req(base, p)
        good = st == 404
        lines.append(f"{'PASS' if good else 'FAIL'} (iv) {p} → {st} (want 404) · cache-control {hfirst(hd, 'cache-control')!r}")
        tsv.append(["iv", p, "GET", st, hfirst(hd, "content-type"), hfirst(hd, "cache-control"), good])
        ok &= good
    return lines, tsv, ok


def cmd_headers(a: argparse.Namespace, argv: list[str]) -> int:
    base = a.target.rstrip("/")
    repo = Path(a.repo).resolve()
    label = a.label or "headers"
    lines = head_lines("headers", argv, repo) + [f"# target {base}"]
    cols = ["part", "path", "variant", "status", "x-nextjs-cache/content-type", "cache-control/notes", "verdict"]
    tsv: list[list] = []
    ok = True
    if a.only == "ac8":
        l8, t8, ok8 = ac8_rows(base)
        p = C.write_tsv(f"bm15-headers-{label}", lines, cols, t8, [])
        lines += l8 + [f"AC8 rows {'PASS' if ok8 else 'FAIL'} · tsv {p.name}"]
        return report("headers", label, lines, ok8)

    rows = expected_rows(load_posts(repo))
    n = len(rows)
    keys = {r[2]: r[3] for r in rows}
    app = repo / ".next" / "server" / "app"
    if a.snapshot:
        before = {ln for ln in Path(a.snapshot).read_text(encoding="utf-8").splitlines() if ln}
        snap_src = f"build snapshot {Path(a.snapshot).name}"
    else:
        before = set(html_list(app))
        snap_src = "taken at the start of this run"
    lines.append(f"# .next/server/app html before: {len(before)} ({snap_src})")

    # (i) calibration on a param-less prerendered page, then every expected path once
    st, hd, _ = req(base, "/blog/about")
    cal = hfirst(hd, "x-nextjs-cache")
    mode = "header" if cal else "fallback"
    lines.append(f"(i) calibration /blog/about (first GET): status {st} · x-nextjs-cache {cal or '(absent)'} · "
                 f"x-nextjs-prerender {hfirst(hd, 'x-nextjs-prerender') or '(absent)'} · cache-control "
                 f"{hfirst(hd, 'cache-control')!r} → discriminator: "
                 + ("x-nextjs-cache header" if mode == "header" else
                    "FALLBACK (header absent): expected .html present + 0 new .html files for expected URLs"))
    first = {"/blog/about": (st, hd)}
    rest = [r[2] for r in rows if r[2] != "/blog/about"]
    first.update({p: (s, h) for p, (s, h, _b) in fetch_many(base, rest).items()})
    hit = st200 = 0
    for r in rows:
        s, h = first[r[2]]
        xc = hfirst(h, "x-nextjs-cache")
        hit += s == 200 and xc == "HIT"
        st200 += s == 200
        tsv.append(["i", r[2], "first-GET", s, xc or "-", hfirst(h, "cache-control"), "HIT" if xc == "HIT" else "-"])
    not200 = [r[2] for r in rows if first[r[2]][0] != 200]
    lines.append(f"(i) status 200 {st200}/{n}" + (f" · not 200 (first 5): {not200[:5]}" if not200 else ""))
    if mode == "header":
        miss = [r[2] for r in rows if hfirst(first[r[2]][1], "x-nextjs-cache") != "HIT"]
        lines.append(f"first-GET HIT {hit}/{n}" + (f" · not HIT (first 5): {miss[:5]}" if miss else ""))
        ok &= hit == n and st200 == n
    else:
        with_file = sum(1 for r in rows if (r[3].lstrip("/") + ".html") in before)
        lines.append(f"(i) fallback: expected keys with a prerendered .html before the run {with_file}/{n}")
        ok &= with_file == n and st200 == n

    # (ii) S18 × 3 variants × 2 + (iii) RSC × 2
    n_pass = n_all = 0
    smax: collections.Counter = collections.Counter()
    fails: list[str] = []
    jobs = [(p, v, h, k) for p in S18 for v, h in VARIANTS for k in (1, 2)]
    jobs += [(RSC_PATH, "rsc", {"RSC": "1"}, k) for k in (1, 2)]
    for p, v, h, k in jobs:
        s, hd, _ = req(base, p, headers=h)
        probs, sm = judge_cache(s, hd)
        n_all += 1
        n_pass += not probs
        smax[sm or "-"] += 1
        part = "iii" if v == "rsc" else "ii"
        tsv.append([part, p, f"{v}#{k}", s, hfirst(hd, "x-nextjs-cache") or "-",
                    hfirst(hd, "cache-control") + (" | " + "; ".join(probs) if probs else ""), "PASS" if not probs else "FAIL"])
        if probs:
            fails.append(f"{p} [{v}#{k}]: {'; '.join(probs)}")
    lines.append(f"(ii)+(iii) AC2 PASS {n_pass}/{n_all} (S18 × 3 variants × 2 + RSC × 2) · s-maxage values "
                 + ", ".join(f"{k}×{c}" for k, c in smax.items()))
    lines += [f"    FAIL {f}" for f in fails[:12]] + ([f"    … {len(fails) - 12} more"] if len(fails) > 12 else [])
    ok &= n_pass == n_all

    # (iv) AC8
    l8, t8, ok8 = ac8_rows(base)
    lines += l8
    tsv += t8
    ok &= ok8

    # (v) recorded, not judged: unknown tag/post twice each
    for p in (UNKNOWN_TAG, UNKNOWN_POST):
        for k in (1, 2):
            s, hd, _ = req(base, p)
            lines.append(f"(v) {p} #{k}: {s} · cache-control {hfirst(hd, 'cache-control')!r} · x-nextjs-cache "
                         f"{hfirst(hd, 'x-nextjs-cache') or '(absent)'} (recorded, not judged)")
            tsv.append(["v", p, f"#{k}", s, hfirst(hd, "x-nextjs-cache") or "-", hfirst(hd, "cache-control"), "recorded"])
    after = set(html_list(app))
    new = sorted(after - before)
    unknown_new = [f for f in new if "zzz-not-a-" in f]
    other_new = [f for f in new if "zzz-not-a-" not in f]
    lines.append(f"(v) new .html under .next/server/app after the run: {len(new)} · for the unknown URLs "
                 f"{unknown_new or 'none'}")
    lines.append(f"new html files for expected URLs {len(other_new)}" + (f" (first 5: {other_new[:5]})" if other_new else ""))
    if mode == "fallback":
        ok &= not other_new
    p = C.write_tsv(f"bm15-headers-{label}", lines[:2], cols, tsv, [])
    lines.append(f"tsv {p.name}")
    return report("headers", label, lines, ok)


# ---------------------------------------------------------------- compare

def cmd_compare(a: argparse.Namespace, argv: list[str]) -> int:
    A, B = a.a.rstrip("/"), a.b.rstrip("/")
    repo = Path(a.repo).resolve()
    label = a.label or "compare"
    only = a.only
    lines = head_lines("compare", argv, repo) + [f"# A {A} · B {B} · only {only}"]
    posts = load_posts(repo)
    rows = expected_rows(posts)
    n = len(rows)
    tagcat = [r for r in rows if r[1] in ("R-TAG", "R-CAT")]
    cf = casefold_rows(posts)
    if only == "canon":
        paths = [r[2] for r in tagcat]
    elif only == "casefold":
        paths = [r[3] for r in cf]
    else:
        paths = [r[2] for r in rows] + [UNKNOWN_POST, UNKNOWN_TAG]
    ra, rb = fetch_many(A, paths), fetch_many(B, paths)
    ea = {p: extract(v[2].decode("utf-8", errors="replace")) for p, v in ra.items()}
    eb = {p: extract(v[2].decode("utf-8", errors="replace")) for p, v in rb.items()}
    ok = True
    summary = []
    tsv = []
    mism: dict[str, list[str]] = {}
    for p in paths:
        d = diff_fields(ea[p], eb[p])
        if ra[p][0] != rb[p][0]:
            d = ["status"] + d
        mism[p] = d
        tsv.append([p, ra[p][0], rb[p][0], ",".join(d) or "-", len(eb[p]["meta_outside_head"]),
                    (eb[p]["canonical"] or ["-"])[0]])

    if only == "all":
        bad = [p for p in paths if mism[p]]
        lines.append(f"AC4a pages {len(paths)} (N {n} + unknown post + unknown tag) · mismatches {len(bad)}")
        for p in bad[:10]:
            lines.append(f"    MISMATCH {p}: {mism[p]} · status {ra[p][0]}/{rb[p][0]}")
            for k in mism[p][:3]:
                if k != "status":
                    lines.append(f"        {k}: A={str(ea[p].get(k))[:160]!r}")
                    lines.append(f"        {k}: B={str(eb[p].get(k))[:160]!r}")
        exp_paths = [r[2] for r in rows]
        in_head = sum(1 for p in exp_paths if rb[p][0] == 200 and eb[p]["title"] and not eb[p]["meta_outside_head"])
        outside = [p for p in exp_paths if eb[p]["meta_outside_head"]]
        if outside:
            lines.append(f"    metadata outside <head> on B (first 3): "
                         + " | ".join(f"{p}: {eb[p]['meta_outside_head'][:3]}" for p in outside[:3]))
        lh_ok = 0
        for p in S18:
            la, lb = hvals(ra[p][1], "link"), hvals(rb[p][1], "link")
            if la == lb:
                lh_ok += 1
            else:
                alt_a = [e for v in la for e in link_entries(v) if 'rel="alternate"' in e]
                alt_b = [e for v in lb for e in link_entries(v) if 'rel="alternate"' in e]
                lines.append(f"    LINK {p}: A {len(la)} header(s) / B {len(lb)} · hreflang entries equal {alt_a == alt_b}"
                             f" · A={'; '.join(la)[:200]!r} · B={'; '.join(lb)[:200]!r}")
        # AC8 compare rows
        ut_a, ut_b = ea[UNKNOWN_TAG], eb[UNKNOWN_TAG]
        lines.append(f"unknown tag {UNKNOWN_TAG}: status {ra[UNKNOWN_TAG][0]}/{rb[UNKNOWN_TAG][0]} · <h1> "
                     f"{ut_a['h1_main']}/{ut_b['h1_main']} · <main> text equal {ut_a['main_text'] == ut_b['main_text']}"
                     f" ({ut_b['main_text'][:80]!r})")
        lines.append(f"unknown post {UNKNOWN_POST}: status {ra[UNKNOWN_POST][0]}/{rb[UNKNOWN_POST][0]} (want 404/404)")
        ok &= not bad and in_head == n and lh_ok == len(S18)
        ok &= ra[UNKNOWN_POST][0] == rb[UNKNOWN_POST][0] == 404
        summary += [f"mismatches {len(bad)}", f"link-header {lh_ok}/{len(S18)}", f"meta-in-head {in_head}/{n}"]

    if only in ("all", "casefold"):
        good = 0
        for key, loc, t, pub, exact in cf:
            s = rb[pub][0]
            h1 = eb[pub]["h1_main"]
            post_set = {f"{public_prefix(loc)}/{enc(p['slugAsParams'])}" for p in posts
                        if p.get("locale") == loc and not p.get("draft")}
            got = {h for h in eb[pub]["main_hrefs"] if h in post_set}
            row_ok = s == 200 and h1 == [t] and got == exact and not mism[pub]
            good += row_ok
            lines.append(f"{'PASS' if row_ok else 'FAIL'} AC5 {loc} {t!r} {pub}: {s} · <h1> {h1} · post links "
                         f"{len(got)} (exact-tag posts {len(exact)}) · AC4a fields vs A {'equal' if not mism[pub] else mism[pub]}")
        ok &= good == len(cf)
        summary.append(f"casefold {'PASS' if good == len(cf) else 'FAIL'} {good}/{len(cf)}")

    if only in ("all", "canon"):
        cm = raw_space = split = 0
        for r in tagcat:
            p = r[2]
            fa = (ea[p]["canonical"], [v for k, v in ea[p]["social"] if k == "og:url"], ea[p]["hreflang"])
            fb = (eb[p]["canonical"], [v for k, v in eb[p]["social"] if k == "og:url"], eb[p]["hreflang"])
            cm += fa != fb or ra[p][0] != rb[p][0]
            for u in fb[0] + fb[1]:
                raw_space += " " in u
                seg = u.split("/tag/", 1)[1] if "/tag/" in u else u.split("/category/", 1)[1] if "/category/" in u else ""
                split += "/" in seg
        for r in named_ac6(rows):
            p = r[2]
            same = (ea[p]["canonical"] == eb[p]["canonical"] and ea[p]["hreflang"] == eb[p]["hreflang"]
                    and [v for k, v in ea[p]["social"] if k == "og:url"] == [v for k, v in eb[p]["social"] if k == "og:url"])
            lines.append(f"{'PASS' if same and ra[p][0] == rb[p][0] == 200 else 'FAIL'} AC6 {r[0]} {r[1]} {r[4]!r} {p}: "
                         f"{ra[p][0]}/{rb[p][0]} · canonical B {(eb[p]['canonical'] or ['-'])[0]}")
        ok &= cm == 0 and raw_space == 0 and split == 0
        summary.append(f"canon mismatches {cm} / {len(tagcat)} · raw-space {raw_space} · split {split}")

    p = C.write_tsv(f"bm15-compare-{label}", lines[:2],
                    ["path", "status_a", "status_b", "mismatched_fields", "meta_outside_head_b", "canonical_b"], tsv, [])
    lines.append(f"tsv {p.name}")
    lines.append(" · ".join(summary))
    return report("compare", label, lines, ok)


# ---------------------------------------------------------------- main

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="sub", required=True)
    b = sub.add_parser("build")
    b.add_argument("--repo", required=True)
    b.add_argument("--log", required=True)
    g = b.add_mutually_exclusive_group()
    g.add_argument("--prefix-origin")
    g.add_argument("--absent")
    b.add_argument("--label")
    h = sub.add_parser("headers")
    h.add_argument("--target", required=True)
    h.add_argument("--repo", default=".", help="tree whose .velite/posts.json + .next/server/app are used (default .)")
    h.add_argument("--only", choices=("all", "ac8"), default="all")
    h.add_argument("--snapshot", help="bm15-build-<label>-html-*.txt from `build` (default: snapshot at run start)")
    h.add_argument("--label")
    c = sub.add_parser("compare")
    c.add_argument("--a", required=True)
    c.add_argument("--b", required=True)
    c.add_argument("--repo", default=".")
    c.add_argument("--only", choices=("all", "canon", "casefold"), default="all")
    c.add_argument("--label")
    a = ap.parse_args(argv)
    return {"build": cmd_build, "headers": cmd_headers, "compare": cmd_compare}[a.sub](a, argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
