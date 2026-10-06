"""BM-04 HTTP checks against a running build (curl-style, no-follow).

  python3.13 scripts/migration/checks/routes.py contract   # AC1: data/ac1-route-contract.tsv -> PASS n/n
  python3.13 scripts/migration/checks/routes.py sitemap    # AC7: 728 mapped paths + 12 legacy probes
  python3.13 scripts/migration/checks/routes.py assets [--repo <ink tree>]   # AC8: every public file under /blog only

Target = $B1_URL (default http://localhost:4420). Every run writes a NEW TSV under $EVIDENCE_DIR.
Exit 0 = all rows pass, 1 = at least one row fails, 2 = usage / setup error.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

WORKERS = 8


def _html_pick(body: str, prefix: str) -> str | None:
    """First attribute value (src/href) that starts with ``prefix`` (``&amp;`` unescaped)."""
    for m in re.finditer(r'''\b(?:src|href)=(["'])(.*?)\1''', body):
        v = html.unescape(m.group(2))
        if v.startswith(prefix):
            return v
    return None


def _loc_ok(loc: str, expect: str, base: str) -> bool:
    """308 Location: same path as expected and no host other than the request host."""
    if not loc:
        return False
    s = urlsplit(loc)
    if s.netloc and s.netloc != urlsplit(base).netloc:
        return False
    return s.path == expect and not s.query


def contract(base: str) -> int:
    rows_in = C.read_tsv(C.DATA / "ac1-route-contract.tsv")
    home_body = None
    out, npass = [], 0
    for r in rows_in:
        rid, path, exp, exp_loc = r["id"], r["path"], r["expect_status"], r["expect_location"]
        note = ""
        if path.startswith("@html:"):
            prefix = path[len("@html:"):]
            if home_body is None:
                st, _h, b = C.fetch(base, "/blog")
                home_body = b.decode("utf-8", "replace") if st == 200 else ""
            picked = _html_pick(home_body, prefix)
            if picked is None:
                out.append([rid, path, exp, "MISSING", "-", "FAIL", f"no value starting with {prefix} in /blog HTML"])
                continue
            path = picked
            note = "from /blog HTML"
        st, hdrs, body = C.fetch(base, path)
        loc = hdrs.get("location", "")
        ok = str(st) == exp
        if exp.startswith("3"):
            ok = ok and _loc_ok(loc, exp_loc, base)
        elif loc:
            ok = False  # a 200/404 row must carry no redirect
        if ok and rid == "R10":  # /blog/tag/A%2FB-test stays one [tag] segment
            has = re.search(r"<h1[^>]*>\s*A/B-test\s*</h1>", body.decode("utf-8", "replace")) is not None
            note = f"h1 A/B-test {'yes' if has else 'NO'}"
            ok = has
        if ok and rid == "R27":
            ct = hdrs.get("content-type", "")
            note = f"content-type {ct}"
            ok = ct.startswith("image/png")
        out.append([rid, path, exp, st, loc or "-", "PASS" if ok else "FAIL", note])
        npass += ok
    n = len(out)
    verdict = f"PASS {npass}/{n}" if npass == n else f"FAIL {n - npass}/{n} (pass {npass}/{n})"
    head = C.header("routes.py contract (AC1)") + [f"# target {base}"]
    p = C.write_tsv("ac1-contract", head, ["id", "path", "expected", "got", "location", "result", "note"], out, [verdict])
    for row in out:
        if row[5] != "PASS":
            print("  FAIL " + "\t".join(str(x) for x in row))
    print("\n".join(head))
    print(f"evidence {p}")
    print(verdict)
    return 0 if npass == n else 1


def _count_config(repo: Path) -> tuple[int, int]:
    txt = (repo / "next.config.ts").read_text(encoding="utf-8")
    return txt.count("permanent"), len(re.findall(r"\bredirects\s*\(", txt))


def sitemap(base: str, repo: Path) -> int:
    smap = C.read_tsv(C.DATA / "sitemap-map-mode-i.tsv")
    contract_rows = C.read_tsv(C.DATA / "ac1-route-contract.tsv")
    legacy = [r["path"] for r in contract_rows if r["id"] in {f"R{i}" for i in range(51, 63)}]
    targets = [("sitemap", r["new_path"], r["old_url"]) for r in smap] + [("legacy", p, "-") for p in legacy]

    def one(t):
        grp, path, old = t
        st, hdrs, _b = C.fetch(base, path, method="GET")
        return [grp, path, old, st, hdrs.get("location", "-") or "-"]

    with ThreadPoolExecutor(WORKERS) as ex:
        out = list(ex.map(one, targets))
    sm = [r for r in out if r[0] == "sitemap"]
    lg = [r for r in out if r[0] == "legacy"]
    n3xx = sum(1 for r in out if 300 <= r[3] < 400)
    s200 = sum(1 for r in sm if r[3] == 200)
    l404 = sum(1 for r in lg if r[3] == 404)
    perm, redir = _count_config(repo)
    ok = n3xx == 0 and s200 == len(sm) == 728 and l404 == len(lg) == 12 and perm == 0 and redir == 0
    summary = (f"3xx {n3xx} · 200 {s200}/{len(sm)} · 404 {l404}/{len(lg)} · "
               f"permanent {perm} · redirects() {redir} (in {repo / 'next.config.ts'})")
    other = {}
    for r in sm:
        if r[3] != 200:
            other[r[3]] = other.get(r[3], 0) + 1
    # Reported, never excused: a non-200 row whose OLD url answers the same status on B0 is a pre-existing
    # base defect (e.g. the 5 Callout "insight" 500s at e7743c4, fixed on ink main a059826). RESULT stays FAIL.
    same_b0 = []
    for r in sm:
        if r[3] != 200 and r[2] != "-":
            st0, _h0, _b0 = C.fetch(C.B0_URL, C.path_of(r[2]))
            if st0 == r[3]:
                same_b0.append(f"{r[1]}={r[3]}")
    tail = [summary, f"sitemap non-200 by status: {other or '{}'}",
            f"base-defect (same non-200 on B0 {C.B0_URL}): {len(same_b0)} {' '.join(same_b0) or '-'}",
            "RESULT " + ("PASS" if ok else "FAIL")]
    head = C.header("routes.py sitemap (AC7)") + [f"# target {base}"]
    p = C.write_tsv("ac7-sitemap", head, ["group", "path", "old_url", "status", "location"], out, tail)
    print("\n".join(head))
    print(f"evidence {p}")
    print("\n".join(tail))
    return 0 if ok else 1


def _asset_files(repo: Path) -> dict[str, list[tuple[str, int]]]:
    pub = repo / "public"
    groups: dict[str, list[tuple[str, int]]] = {"static": [], "images": [], "videos": [], "diagrams": [], "root": []}
    for d in ("static", "images", "videos", "diagrams"):
        for f in sorted((pub / d).rglob("*")):
            if f.is_file() and not f.name.startswith("."):
                groups[d].append((f.relative_to(pub).as_posix(), f.stat().st_size))
    for f in sorted(pub.iterdir()):
        if f.is_file() and not f.name.startswith("."):
            groups["root"].append((f.name, f.stat().st_size))
    return groups


def assets(base: str, repo: Path) -> int:
    groups = _asset_files(repo)
    inv = {r["dir"]: int(r["total_expected"]) for r in C.read_tsv(C.DATA / "ac8-asset-inventory.tsv")}
    todo = [(d, rel, size) for d, fl in groups.items() for rel, size in fl]

    def one(t):
        d, rel, size = t
        q = quote(rel, safe="/")
        sb, hb, _ = C.fetch(base, "/blog/" + q, method="HEAD")
        sr, _hr, _ = C.fetch(base, "/" + q, method="HEAD")
        cl = hb.get("content-length", "")
        ok_blog = sb == 200 and cl == str(size)
        ok_root = sr == 404
        return [d, rel, size, sb, cl or "-", sr, "PASS" if ok_blog and ok_root else "FAIL"]

    with ThreadPoolExecutor(WORKERS) as ex:
        out = list(ex.map(one, todo))
    lines = []
    tot_ok_blog = tot_ok_root = 0
    for d in ("static", "images", "videos", "diagrams", "root"):
        rows = [r for r in out if r[0] == d]
        ob = sum(1 for r in rows if r[3] == 200 and r[4] == str(r[2]))
        orr = sum(1 for r in rows if r[5] == 404)
        tot_ok_blog += ob
        tot_ok_root += orr
        lines.append(f"{d}: files {len(rows)} (expected {inv.get(d, '?')}) · /blog 200+size {ob} · root 404 {orr}")
    n = len(out)
    ok = (tot_ok_blog == n and tot_ok_root == n and n == inv.get("ALL", -1))
    lines.append(f"ALL: files {n} (expected {inv.get('ALL', '?')}) · {tot_ok_blog} × (200 + size match) · {tot_ok_root} × 404 at root")
    lines.append("RESULT " + ("PASS" if ok else "FAIL"))
    head = C.header("routes.py assets (AC8)") + [f"# target {base} · files walked under {repo / 'public'}"]
    p = C.write_tsv("ac8-assets", head, ["dir", "path", "size", "blog_status", "blog_content_length", "root_status", "result"], out, lines)
    print("\n".join(head))
    print(f"evidence {p}")
    print("\n".join(lines))
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["contract", "sitemap", "assets"])
    ap.add_argument("--repo", type=Path, default=C.REPO, help="ink tree whose public/ + next.config.ts are read (default: this worktree)")
    a = ap.parse_args()
    base = C.B1_URL
    if a.mode == "contract":
        return contract(base)
    if a.mode == "sitemap":
        return sitemap(base, a.repo)
    return assets(base, a.repo)


if __name__ == "__main__":
    sys.exit(main())
