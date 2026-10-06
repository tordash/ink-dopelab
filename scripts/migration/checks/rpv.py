"""BM-04 T11 (ADR-01 X4 proof): requests per view that would go through the Cloudflare Worker, B0 vs B1 (vs B1′).

  python3.13 scripts/migration/checks/rpv.py                         # B0 (:4410, old paths) + B1 (:4420, /blog paths)
  python3.13 scripts/migration/checks/rpv.py --only b1 --label b1prime --asset-origin http://127.0.0.1:4420
                                                                     # B1′ = B1 built with BLOG_ASSET_PREFIX on

Measurement = BM-02 measure_rpv.py (ψ/…/stories/BM-02, categorisation copied, not edited): headless Chromium
390×844 mobile (DPR 3, iPhone UA), cold context per view, full scroll (wheel 700 px), GET only, analytics beacons
(GA/GTM, /_vercel/insights view|event, speed-insights, giscus) + lin.ee + lab.dopelab.studio aborted, never sent.
"Via Worker" = every request to the page origin (the Worker sees every request under dopelab.studio/blog*);
requests to --asset-origin (the assetPrefix / images.path host) are counted apart: they bypass the Worker.
req/view = ceil(Σ mix × run-max via-Worker) + 1 beacon (Fraction-exact, as BM-02); headroom = 100,000 / req/day,
req/day = PV × req/view + crawler (ADR-01 X4: high = 2,000 PV + 6,000 crawler).
X4-f (fix round 1, reviewer F2): every via-Worker URL is listed per template (run max count, category); URLs other
than html + vercel_insights are flagged "extra" (each must be explained). B1 is judged: RESULT PASS when the
measured req/view ≤ --max-rpv (default 6 = ≥ 5× headroom at "high": 2,000 × 6 + 6,000 = 18,000/day), else FAIL
(exit 1). B0 (old app) is the reference and never judged. --post SLUG also takes "en/<slug>".
Writes a NEW x4-rpv-<label>-<HHMMSS>.txt (+ .json) under $EVIDENCE_DIR.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from fractions import Fraction
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

PAGES = {  # template: (B0 path, B1 path) — TASKS T11
    "post": ("/th/blog/90-percent-business-from-phone", "/blog/90-percent-business-from-phone"),
    "home": ("/th", "/blog"),
    "list": ("/th/blog", "/blog/all"),
    "tag": ("/th/blog/tag/ai", "/blog/tag/ai"),
}
MIX = {"post": Fraction(80, 100), "home": Fraction(10, 100), "list": Fraction(5, 100), "tag": Fraction(5, 100)}
SCENARIOS = {"low": (30, 300), "mid": (200, 1500), "high": (2000, 6000)}
QUOTA = 100_000
BEACON = 1
BLOCK = re.compile(r"google-analytics\.com|googletagmanager\.com|/_vercel/insights/(view|event)"
                   r"|/_vercel/speed-insights/vitals|giscus\.app|lin\.ee|lab\.dopelab\.studio")
UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 dopelab-bm04-rpv")
DROP_AP = ("next_js", "next_css", "next_font", "next_image")  # BM-02: leave the Worker under assetPrefix + images.path
EXPECTED = ("html", "vercel_insights")  # X4-f: the only via-Worker URLs a view should need once images are on the asset host


def origin(u: str) -> str:
    p = urlparse(u)
    return f"{p.scheme}://{p.netloc}"


def cat(url: str, rtype: str, headers: dict) -> str:
    """BM-02 measure_rpv.cat, with the /blog basePath stripped first."""
    p = urlparse(url)
    path = p.path
    if path == "/blog" or path.startswith("/blog/"):
        path = path[len("/blog"):] or "/"
    if "_rsc=" in (p.query or "") or headers.get("rsc") == "1":
        return "rsc"
    if rtype == "document":
        return "html"
    if path.startswith("/_next/static/") and path.endswith(".js"):
        return "next_js"
    if path.startswith("/_next/static/") and path.endswith(".css"):
        return "next_css"
    if path.startswith("/_next/static/media/"):
        return "next_font"
    if path.startswith("/_next/image"):
        return "next_image"
    if path.startswith("/_vercel/"):
        return "vercel_insights"
    if path.startswith("/api/og"):
        return "api_og"
    if path.startswith(("/static/", "/images/", "/videos/", "/diagrams/")):
        return "public_asset"
    return "other:" + path[:40]


def measure_one(browser, url: str, asset_origin: str | None) -> dict:
    page_origin = origin(url)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3,
                              is_mobile=True, has_touch=True, user_agent=UA)
    counts: dict[str, int] = {}
    urls: dict[str, int] = {}
    url_cat: dict[str, str] = {}
    asset: dict[str, int] = {}
    rsc_urls: list[str] = []
    failed: list[str] = []
    aborted = {"n": 0}

    def on_route(route):
        req = route.request
        if req.method != "GET" or BLOCK.search(req.url):
            aborted["n"] += 1
            route.abort()
            return
        route.continue_()

    ctx.route("**/*", on_route)
    pg = ctx.new_page()

    def on_req(rq):
        if rq.method != "GET" or BLOCK.search(rq.url):
            return
        o = origin(rq.url)
        c = cat(rq.url, rq.resource_type, rq.headers)
        if o == page_origin:
            counts[c] = counts.get(c, 0) + 1
            pu = urlparse(rq.url)
            key = pu.path + (("?" + pu.query) if pu.query else "")
            urls[key] = urls.get(key, 0) + 1
            url_cat[key] = c
            if c == "rsc":
                rsc_urls.append(urlparse(rq.url).path)
        elif asset_origin and o == asset_origin:
            asset[c] = asset.get(c, 0) + 1
        else:
            counts["3p:" + (urlparse(rq.url).hostname or "?")] = counts.get("3p:" + (urlparse(rq.url).hostname or "?"), 0) + 1

    pg.on("request", on_req)
    pg.on("requestfailed", lambda rq: failed.append(rq.url) if not BLOCK.search(rq.url) and rq.method == "GET" else None)
    try:
        pg.goto(url, wait_until="networkidle", timeout=60000)
    except Exception:  # noqa: BLE001 — a stuck local image request must not lose the run; counts are still valid
        pass
    pg.wait_for_timeout(2500)
    h = pg.evaluate("document.body.scrollHeight")
    y = 0
    while y < h:
        y += 700
        pg.mouse.wheel(0, 700)
        pg.wait_for_timeout(350)
        h = pg.evaluate("document.body.scrollHeight")
    pg.wait_for_timeout(2500)
    ctx.close()
    same = {k: v for k, v in counts.items() if not k.startswith("3p:")}
    return {
        "via_worker": sum(same.values()),
        "by_type": dict(sorted(same.items())),
        "asset_host": dict(sorted(asset.items())),
        "asset_host_total": sum(asset.values()),
        "third_party": {k[3:]: v for k, v in counts.items() if k.startswith("3p:")},
        "rsc": same.get("rsc", 0),
        "rsc_paths": sorted(set(rsc_urls)),
        "via_worker_urls": [[u, url_cat[u], n] for u, n in sorted(urls.items())],
        "projected_ap": sum(v for k, v in same.items() if k not in DROP_AP),
        "failed": failed[:10],
        "aborted": aborted["n"],
    }


def rpv(per_template: dict[str, int]) -> int:
    return math.ceil(sum((MIX[t] * per_template[t] for t in MIX), Fraction(0))) + BEACON


HYDRATED = 'button[aria-label="Toggle theme"]'
URLISH = re.compile(r'''(?:src|href|srcset|imagesrcset)=(["'])(.*?)\1''', re.S)
OG = re.compile(r'''<meta[^>]+property="og:image"[^>]+content="([^"]*)"''')


def _next_urls(html_text: str) -> list[str]:
    import html as _h
    out = []
    for m in URLISH.finditer(html_text):
        v = _h.unescape(m.group(2))
        for cand in ([c.strip().split()[0] for c in re.split(r",\s+", v) if c.strip()] if "," in v and " " in v else [v]):
            if "/_next/static/" in cand or "/_next/image" in cand:
                out.append(cand)
    return out


def prime_proof(prefix: str, og_file: Path) -> int:
    """B1′ (BLOG_ASSET_PREFIX on): every _next/static + _next/image URL starts with the prefix and answers 200,
    the page hydrates (theme toggle), fonts load, og:image recorded (compared after the prefix-off rebuild)."""
    from playwright.sync_api import sync_playwright
    out = C.header("rpv.py --prime-proof (X4 B1′)") + [f"# prefix {prefix} · page origin {C.B1_URL}"]
    ok = True
    og = {}
    n_all = n_pref = n_200 = 0
    seen: dict[str, int] = {}
    for t, (_b0, p) in PAGES.items():
        st, _h, body = C.fetch(C.B1_URL, p)
        txt = body.decode("utf-8", "replace")
        urls = _next_urls(txt)
        pref = [u for u in urls if u.startswith(prefix + "/_next/")]
        bad = [u for u in urls if not u.startswith(prefix + "/_next/")]
        for u in pref:
            if u not in seen:
                pu = urlparse(u)
                seen[u] = C.fetch(f"{pu.scheme}://{pu.netloc}", pu.path + (("?" + pu.query) if pu.query else ""))[0]
        ok200 = sum(1 for u in pref if seen[u] == 200)
        n_all += len(urls); n_pref += len(pref); n_200 += ok200
        m = OG.search(txt)
        og[p] = m.group(1) if m else None
        out.append(f"{t} {p}: HTML {st} · _next URLs {len(urls)} · with prefix {len(pref)} · 200 {ok200}/{len(pref)}"
                   + (f" · NOT prefixed: {bad[:3]}" if bad else "") + f" · og:image {og[p]}")
        ok &= st == 200 and not bad and ok200 == len(pref) and len(pref) > 0
    out.append(f"prefix URLs 200 {n_200}/{n_pref} (all _next URLs {n_all}, distinct fetched {len(seen)})")
    og_file.write_text(json.dumps(og, indent=1), encoding="utf-8")
    out.append(f"og:image values saved to {og_file} (compare after the prefix-off rebuild)")
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        for t in ("home", "post"):
            ctx = br.new_context(viewport={"width": 1280, "height": 800}, color_scheme="light")
            ctx.route("**/*", lambda r: r.abort() if BLOCK.search(r.request.url) else r.continue_())
            failed = []
            pg = ctx.new_page()
            pg.on("requestfailed", lambda rq: failed.append(f"{rq.url} ({rq.failure})") if not BLOCK.search(rq.url) else None)
            pg.goto(C.B1_URL + PAGES[t][1], wait_until="domcontentloaded", timeout=60000)
            hyd = True
            try:
                pg.wait_for_selector(HYDRATED, timeout=30000)
                pg.click(HYDRATED)
                pg.wait_for_timeout(300)
                dark = pg.evaluate("() => document.documentElement.classList.contains('dark')")
            except Exception:  # noqa: BLE001
                hyd, dark = False, False
            try:
                pg.wait_for_load_state("networkidle", timeout=15000)
            except Exception:  # noqa: BLE001
                pass
            fonts = pg.evaluate("async () => { await document.fonts.ready; const s = {}; for (const f of document.fonts) s[f.status] = (s[f.status]||0)+1; return s; }")
            font_fail = [f for f in failed if "/_next/static/media/" in f]
            out.append(f"{t}: hydrated {'yes' if hyd and dark else 'NO'} (theme toggle → dark {dark}) · document.fonts {fonts} · "
                       f"failed requests {len(failed)} (fonts {len(font_fail)}){' e.g. ' + failed[0] if failed else ''}")
            ok &= hyd and dark
            ctx.close()
        br.close()
    out.append("RESULT " + ("PASS" if ok else "FAIL") + " (fonts judged separately: see the CORS lines)")
    p = C.evidence_path("x4-prime", "txt")
    p.write_text("\n".join(out) + "\n", encoding="utf-8")
    print("\n".join(out))
    print(f"evidence {p}")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", choices=["b0", "b1"], help="measure one build only")
    ap.add_argument("--label", default="b0-b1")
    ap.add_argument("--runs", type=int, default=2)
    ap.add_argument("--asset-origin", help="assetPrefix / images.path origin (counted apart, bypasses the Worker)")
    ap.add_argument("--post", metavar="SLUG", help="measure this post (th) as the post template instead of 90-percent-business-from-phone")
    ap.add_argument("--prime-proof", metavar="PREFIX", help="B1′ checks for this BLOG_ASSET_PREFIX value instead of measuring")
    ap.add_argument("--og-file", type=Path, default=C.EVIDENCE_DIR / "x4-og-image.json")
    ap.add_argument("--max-rpv", type=int, default=6, help="X4-f: B1 passes when req/view via Worker ≤ this (default 6)")
    a = ap.parse_args()
    if a.prime_proof:
        return prime_proof(a.prime_proof.rstrip("/"), a.og_file)
    if a.post:
        PAGES["post"] = (f"/th/blog/{a.post}", f"/blog/{a.post}")
    from playwright.sync_api import sync_playwright

    builds = [("b0", C.B0_URL, 0), ("b1", C.B1_URL, 1)]
    if a.only:
        builds = [b for b in builds if b[0] == a.only]
    data: dict = {"measured": C.stamp(), "runs": a.runs, "asset_origin": a.asset_origin, "builds": {}}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for name, base, idx in builds:
            data["builds"][name] = {}
            for t, paths in PAGES.items():
                url = base + paths[idx]
                runs = [measure_one(browser, url, a.asset_origin) for _ in range(a.runs)]
                print(f"[rpv] {name} {t} {paths[idx]} via-Worker {[r['via_worker'] for r in runs]} rsc {[r['rsc'] for r in runs]}",
                      file=sys.stderr, flush=True)
                data["builds"][name][t] = {"path": paths[idx], "runs": runs,
                                           "max_via_worker": max(r["via_worker"] for r in runs),
                                           "max_rsc": max(r["rsc"] for r in runs),
                                           "max_projected_ap": max(r["projected_ap"] for r in runs),
                                           "max_asset_host": max(r["asset_host_total"] for r in runs)}
        browser.close()

    out = C.header(f"rpv.py (X4 · {a.label})") + [f"# runs {a.runs} · asset origin {a.asset_origin or '-'} · mix post .80 home .10 list .05 tag .05 · +{BEACON} beacon"]
    out.append("build\ttemplate\tpath\tvia_worker(run max)\trsc(run max)\tasset_host(run max)\tprojected_if_assetPrefix+images.path\tby_type (last run)\trsc paths (last run)\tfailed (last run)")
    for name, tm in data["builds"].items():
        for t, d in tm.items():
            last = d["runs"][-1]
            out.append("\t".join(str(x) for x in (name, t, d["path"], d["max_via_worker"], d["max_rsc"], d["max_asset_host"],
                                                  d["max_projected_ap"], json.dumps(last["by_type"]), " ".join(last["rsc_paths"]) or "-",
                                                  " ".join(last["failed"]) or "-")))
    for name, tm in data["builds"].items():
        per = {t: tm[t]["max_via_worker"] for t in MIX}
        proj = {t: tm[t]["max_projected_ap"] for t in MIX}
        r_meas, r_proj = rpv(per), rpv(proj)
        out.append(f"{name}: req/view via Worker (measured, as built) = {r_meas} · projected with assetPrefix+images.path (BM-02 categories) = {r_proj}")
        for sc, (pv, crawl) in SCENARIOS.items():
            for lab, r in (("as built", r_meas), ("projected AP", r_proj)):
                day = pv * r + crawl
                out.append(f"  {name} {sc:4} {lab:12} PV {pv:>5} × {r} + crawler {crawl:>5} = {day:>7,}/day → headroom {QUOTA / day:.1f}× "
                           f"({'meets' if QUOTA / day >= 5 else 'BELOW'} 5×{' · ≥ ADR alert line 20,000/day' if day >= 20000 else ''})")
    # X4-f: per-template via-Worker URL list (count = max over runs) + extras, then the B1 verdict
    verdict = None
    for name, tm in data["builds"].items():
        for t, d in tm.items():
            mx: dict[str, list] = {}
            for r in d["runs"]:
                for u, c, n in r["via_worker_urls"]:
                    mx[u] = [c, max(n, mx.get(u, [c, 0])[1])]
            d["via_worker_urls_max"] = [[u, c, n] for u, (c, n) in sorted(mx.items())]
            extra = [(u, c, n) for u, (c, n) in sorted(mx.items()) if c not in EXPECTED]
            d["extra"] = [list(x) for x in extra]
            out.append(f"{name} {t} {d['path']}: via-Worker URLs {len(mx)} (requests {sum(n for c, n in mx.values())}) · "
                       f"extra (not {'/'.join(EXPECTED)}) {len(extra)}")
            for u, (c, n) in sorted(mx.items()):
                out.append(f"    {'extra ' if c not in EXPECTED else '      '}{n}× {c:16} {u}")
        if name == "b1":
            r_meas = rpv({t: tm[t]["max_via_worker"] for t in MIX})
            day = SCENARIOS["high"][0] * r_meas + SCENARIOS["high"][1]
            n_extra = sum(len(tm[t]["extra"]) for t in tm)
            verdict = r_meas <= a.max_rpv
            out.append(f"RESULT {'PASS' if verdict else 'FAIL'} (b1 req/view via Worker {r_meas} {'≤' if verdict else '>'} "
                       f"{a.max_rpv} · high {day:,}/day → headroom {QUOTA / day:.1f}× · extra via-Worker URLs {n_extra}"
                       f"{' (each must be explained)' if n_extra else ''})")
    if verdict is None:
        out.append("RESULT n/a (b0 only: the old app is the reference, not judged)")
    p = C.evidence_path(f"x4-rpv-{a.label}", "txt")
    p.write_text("\n".join(out) + "\n", encoding="utf-8")
    p.with_suffix(".json").write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    print("\n".join(out))
    print(f"evidence {p}")
    return 0 if verdict is not False else 1


if __name__ == "__main__":
    sys.exit(main())
