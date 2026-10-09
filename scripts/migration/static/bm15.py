#!/usr/bin/env python3.13
"""BM-15 checks: static rendering of the /blog pages (SPEC §5). python3.13 stdlib (+ playwright for `ondemand`).

  python3.13 scripts/migration/static/bm15.py build --repo <tree> --log <build log> \
      [--prefix-origin ORIGIN | --absent STRING] [--label L]

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
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote, unquote

HERE = Path(__file__).resolve().parent
os.environ.setdefault("EVIDENCE_DIR", str(Path.home() / "Projects/dopelab/ψ/writing/blog-migration/stories/BM-15/evidence"))
sys.path.insert(0, str(HERE.parent / "checks"))
import common as C  # noqa: E402  (BM-04, read-only: evidence_path, stamp, fetch, write_tsv)

PAGES = [("R-HOME", ""), ("R-PAGE", "/all"), ("R-PAGE", "/about"), ("R-PAGE", "/contact")]
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
    a = ap.parse_args(argv)
    return {"build": cmd_build}[a.sub](a, argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
