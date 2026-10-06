"""BM-04 X4-f (Helm (ก), #5 6018411118): every raw <img> loads from the asset host when BLOG_ASSET_PREFIX is on,
and every <img> stays byte-identical when it is off.

  # prefix OFF (env unset): save the baseline, then compare a later build against it
  python3.13 scripts/migration/checks/img_host.py --record                    # writes x4f-img-baseline-<HHMMSS>.json
  python3.13 scripts/migration/checks/img_host.py --baseline <that .json>     # PASS = identical <img> tags + og:image
  # prefix ON (B1′ = built AND started with BLOG_ASSET_PREFIX=<asset origin>/blog)
  python3.13 scripts/migration/checks/img_host.py --asset-origin http://127.0.0.1:4482 --baseline <that .json> \
      [--og-file x4-og-b1prime.json]

Pages (B1 paths): the heaviest post (90-percent-business-from-phone, 10 MDX images + cover), an en post with an MDX
image (agent-teams-11-ai), the ADR post (anthropic-ipo-350b, 0 MDX images), the post with literal JSX <img> in its MDX
(knowledge-graph-ai-brain-connected), home, /all, /tag/ai, about.

Per page (Chromium 1280×800, light, analytics/giscus/lab hosts aborted):
  SSR   raw HTML: every <img> tag (+ <link rel=preload as=image>) and its URL attributes (src, srcset, imagesrcset, href).
  DOM   after hydration (React fiber on <header>) + full scroll down and back: every <img> getAttribute(src|srcset),
        currentSrc, the full attribute list, loaded (complete && naturalWidth > 0).
  NET   image-type requests, split page origin (= through the Worker) vs asset origin.
  LOG   console errors + page errors, origins replaced by <origin>. Counted apart, never judged: lines about aborted
        analytics hosts, and the local-only 404 of /blog/_vercel/insights/script.js (Vercel serves it; `next start`
        does not). Judged against the baseline of the same page: a NEW error = FAIL; a baseline error is listed as
        pre-existing (React #418 on posts whose markdown images render <figure> inside <p>: on B0 c9ea3cb too).
Prefix ON judges: every SSR and DOM image URL is on the asset origin (http(s) third-party hosts are listed, data: kept),
  0 image requests to the page origin, every <img> loaded, SSR src == DOM src, 0 new errors, og:image equal to
  --og-file (the 47ea8a8 B1′ values: the fix must not move og:image), and a client-side render (soft navigation from
  /tag/remote-control to the heaviest post through its <Link>; /all does not list it) also puts every article <img> on
  the asset origin (= the prefix reached the client bundle, not only the server HTML).
  With --asset-origin the asset origin's responses get `access-control-allow-origin: *` (pixels.py --acao-origin shim:
  live Vercel sends it, local `next start` does not), so cross-origin fonts load and the console stays clean.
Prefix OFF judges: SSR <img> tags, DOM attribute lists and og:image identical to the baseline; 0 new errors.
Writes a NEW x4f-img-<label>-<HHMMSS>.txt (+ .json) under $EVIDENCE_DIR. Exit 0 = RESULT PASS.
"""
from __future__ import annotations

import argparse
import html as H
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

HEAVY = "/blog/90-percent-business-from-phone"
SOFT_FROM = "/blog/tag/remote-control"  # lists HEAVY through a <Link> (/blog/all and /blog do not)
PAGES = [
    HEAVY,
    "/blog/en/agent-teams-11-ai",
    "/blog/anthropic-ipo-350b",
    "/blog/knowledge-graph-ai-brain-connected",
    "/blog",
    "/blog/all",
    "/blog/tag/ai",
    "/blog/about",
]
BLOCK = re.compile(r"google-analytics\.com|googletagmanager\.com|analytics\.google\.com|/_vercel/insights/(view|event)"
                   r"|/_vercel/speed-insights|giscus\.app|lin\.ee|lab\.dopelab\.studio")
IMG_TAG = re.compile(r"<img\b[^>]*>", re.I | re.S)
PRELOAD_IMG = re.compile(r"<link\b(?=[^>]*\bas=\"image\")[^>]*>", re.I | re.S)
ATTR = re.compile(r'''\b(src|srcset|imagesrcset|href)=(["'])(.*?)\2''', re.I | re.S)
OG = re.compile(r'''<meta[^>]+property="og:image"[^>]+content="([^"]*)"''')
HYDRATED_JS = ("() => { const h = document.querySelector('header');"
               " return !!h && Object.keys(h).some(k => k.startsWith('__reactFiber')); }")
LOCAL_ONLY = re.compile(r"404 \(Not Found\) @ <origin>/blog/_vercel/insights/script\.js$")
IMGS_JS = """() => [...document.images].map(i => ({
  src: i.getAttribute('src'), srcset: i.getAttribute('srcset'), current: i.currentSrc,
  attrs: [...i.attributes].map(a => [a.name, a.value]), loaded: i.complete && i.naturalWidth > 0 }))"""


def origin(u: str) -> str:
    p = urlparse(u)
    return f"{p.scheme}://{p.netloc}"


def candidates(v: str | None) -> list[str]:
    """src → [src]; srcset → every URL in it."""
    if not v:
        return []
    if "," in v or re.search(r"\s\d+(\.\d+)?[wx]\b", v):
        return [c.strip().split()[0] for c in re.split(r",\s+", v.strip()) if c.strip()]
    return [v.strip()]


def classify(url: str, base: str, asset_origin: str | None) -> str:
    """asset | page | 3p | data. Relative URLs resolve against the page = through the Worker."""
    if url.startswith("data:"):
        return "data"
    o = origin(urljoin(base + "/", url))
    if asset_origin and o == asset_origin:
        return "asset"
    if o == base:
        return "page"
    return "3p"


def ssr_images(txt: str) -> tuple[list[str], list[tuple[str, str]]]:
    """(raw <img> tags in order, [(attr, url)] of every image URL incl. <link rel=preload as=image>)."""
    tags = IMG_TAG.findall(txt)
    urls: list[tuple[str, str]] = []
    for t in tags + PRELOAD_IMG.findall(txt):
        for m in ATTR.finditer(t):
            name = m.group(1).lower()
            if name == "href" and not t.lower().startswith("<link"):
                continue
            for c in candidates(H.unescape(m.group(3))):
                urls.append((name, c))
    return tags, urls


def norm(line: str, base: str, asset_origin: str | None) -> str:
    for o in filter(None, (asset_origin, base)):
        line = line.replace(o, "<origin>")
    return line


def scan(browser, base: str, path: str, asset_origin: str | None, soft_nav_to: str | None = None) -> dict:
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme="light", locale="th-TH",
                              timezone_id="Asia/Bangkok")
    ctx.route("**/*", lambda r: r.abort() if BLOCK.search(r.request.url) else r.continue_())
    if asset_origin:
        def add_acao(route):
            r = route.fetch()
            route.fulfill(response=r, headers={**r.headers, "access-control-allow-origin": "*"})
        ctx.route(asset_origin + "/**", add_acao)
    errors: list[str] = []
    errors_blocked: list[str] = []
    errors_local: list[str] = []
    img_req: dict[str, list[str]] = {"page": [], "asset": [], "3p": []}
    pg = ctx.new_page()

    def on_console(m):
        if m.type != "error":
            return
        loc = (m.location or {}).get("url", "") if isinstance(m.location, dict) else ""
        line = norm(f"{m.text[:200]} @ {loc}", base, asset_origin)
        if BLOCK.search(m.text) or BLOCK.search(loc):
            errors_blocked.append(line)
        elif LOCAL_ONLY.search(line):
            errors_local.append(line)
        else:
            errors.append(line)

    pg.on("console", on_console)
    pg.on("pageerror", lambda e: errors.append(norm(f"pageerror: {str(e)[:200]}", base, asset_origin)))

    def on_req(rq):
        if rq.resource_type != "image" or BLOCK.search(rq.url):
            return
        img_req[classify(rq.url, base, asset_origin) if not rq.url.startswith("data:") else "3p"].append(rq.url)

    pg.on("request", on_req)
    try:
        resp = pg.goto(base + path, wait_until="networkidle", timeout=60000)
        status = resp.status if resp else 0
    except Exception as e:  # noqa: BLE001 — a stuck request must not lose the run; judged below
        status = -1
        errors.append(f"goto: {str(e)[:160]}")
    hydrated = True
    try:
        pg.wait_for_function(HYDRATED_JS, timeout=30000)
    except Exception:  # noqa: BLE001
        hydrated = False
    nav = None
    if soft_nav_to:
        # client-side render: click the <Link> to the heaviest post (prefetch={false}, so it fetches RSC on click)
        sel = f'a[href="{soft_nav_to}"]'
        n_links = pg.locator(sel).count()
        if n_links:
            pg.locator(sel).first.scroll_into_view_if_needed()
            pg.locator(sel).first.click()
            try:
                pg.wait_for_url("**" + soft_nav_to, timeout=30000)
                pg.wait_for_function("() => document.querySelectorAll('article img').length > 0", timeout=30000)
            except Exception:  # noqa: BLE001
                pass
            # a client-side navigation keeps the document: its navigation entry still names /all, not the post
            doc = pg.evaluate("() => performance.getEntriesByType('navigation')[0].name")
            nav = {"link": sel, "links_found": n_links, "url_after": pg.url, "document": doc,
                   "full_reload": doc == pg.url or not pg.url.endswith(soft_nav_to)}
        else:
            nav = {"link": sel, "links_found": 0}
    h = pg.evaluate("document.body.scrollHeight")
    y = 0
    while y < h:
        y += 700
        pg.mouse.wheel(0, 700)
        pg.wait_for_timeout(250)
        h = pg.evaluate("document.body.scrollHeight")
    pg.wait_for_timeout(1500)
    pg.evaluate("window.scrollTo(0, 0)")
    try:
        pg.wait_for_load_state("networkidle", timeout=15000)
    except Exception:  # noqa: BLE001
        pass
    imgs = pg.evaluate(IMGS_JS)
    ctx.close()
    return {"status": status, "hydrated": hydrated, "imgs": imgs, "img_requests": img_req, "errors": errors,
            "errors_blocked_hosts": errors_blocked, "errors_local_only": errors_local, "soft_nav": nav}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--b1-url", default=C.B1_URL)
    ap.add_argument("--record", action="store_true", help="prefix off: save the baseline JSON")
    ap.add_argument("--baseline", type=Path, help="compare with this baseline JSON (prefix off: everything; on: errors)")
    ap.add_argument("--asset-origin", help="prefix on: the asset origin (scheme://host:port of BLOG_ASSET_PREFIX)")
    ap.add_argument("--og-file", type=Path, help="prefix on: og:image values the fix must not move (rpv.py --prime-proof file)")
    ap.add_argument("--label", default=None)
    a = ap.parse_args()
    if a.record == bool(a.baseline):
        ap.error("give exactly one of --record / --baseline")
    if a.record and a.asset_origin:
        ap.error("--record is prefix off: no --asset-origin")
    base = a.b1_url.rstrip("/")
    asset = a.asset_origin.rstrip("/") if a.asset_origin else None
    mode = "on" if asset else ("record" if a.record else "off")
    label = a.label or {"on": "on", "record": "baseline", "off": "off"}[mode]
    from playwright.sync_api import sync_playwright

    out = C.header(f"img_host.py (X4-f · prefix {mode})") + [
        f"# page origin {base} · asset origin {asset or '-'} · pages {len(PAGES)}"
        + (f" · baseline {a.baseline}" if a.baseline else "") + (f" · og-file {a.og_file}" if a.og_file else "")]
    data: dict = {"measured": C.stamp(), "mode": mode, "page_origin": base, "asset_origin": asset, "pages": {}}
    base_data = json.loads(a.baseline.read_text(encoding="utf-8")) if a.baseline else None
    # the --prime-proof file keeps the raw attribute text (&amp;): compare unescaped values
    og_want = {k: (H.unescape(v) if v else v) for k, v in json.loads(a.og_file.read_text(encoding="utf-8")).items()} if a.og_file else {}
    ok_all = True
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        for p in PAGES:
            st, _h, body = C.fetch(base, p)
            txt = body.decode("utf-8", "replace")
            tags, urls = ssr_images(txt)
            m = OG.search(txt)
            og = H.unescape(m.group(1)) if m else None
            d = scan(br, base, p, asset)
            d.update({"http": st, "ssr_img_tags": tags, "ssr_urls": urls, "og_image": og})
            data["pages"][p] = d
            dom_urls = [(k, c) for i in d["imgs"] for k in ("src", "srcset") for c in candidates(i[k])]
            dom_cur = [i["current"] for i in d["imgs"] if i["current"]]
            fails: list[str] = []
            if st != 200 or d["status"] != 200:
                fails.append(f"HTTP {st}/{d['status']}")
            if not d["hydrated"]:
                fails.append("not hydrated")
            known = set(base_data["pages"].get(p, {}).get("errors", [])) if base_data else set()
            new_err = [e for e in d["errors"] if e not in known]
            pre_err = sorted({e for e in d["errors"] if e in known})
            if new_err and mode != "record":
                fails.append(f"NEW console/page errors {len(new_err)}: {new_err[:2]}")
            err_txt = (f"errors new {len(new_err)} · pre-existing {len(pre_err)}{(' ' + str([e[:60] for e in pre_err])) if pre_err else ''}"
                       f" · local-only {len(d['errors_local_only'])} · aborted-host {len(d['errors_blocked_hosts'])}")
            if mode == "on":
                cls = {}
                for _k, u in urls + dom_urls + [("current", u) for u in dom_cur]:
                    cls.setdefault(classify(u, base, asset), set()).add(u)
                if cls.get("page"):
                    fails.append(f"image URLs on the page origin {len(cls['page'])}: {sorted(cls['page'])[:3]}")
                if d["img_requests"]["page"]:
                    fails.append(f"image requests through the page origin {len(d['img_requests']['page'])}: "
                                 f"{d['img_requests']['page'][:3]}")
                not_loaded = [i["src"] for i in d["imgs"] if not i["loaded"]]
                if not_loaded:
                    fails.append(f"not loaded {len(not_loaded)}: {not_loaded[:3]}")
                ssr_src = [u for k, u in urls if k == "src"]
                dom_src = [i["src"] for i in d["imgs"] if i["src"]]
                if ssr_src != dom_src:
                    fails.append(f"SSR src != DOM src (ssr {len(ssr_src)} · dom {len(dom_src)})")
                if p in og_want and og_want[p] != og:
                    fails.append(f"og:image moved vs --og-file: {og} != {og_want[p]}")
                og_base = base_data["pages"].get(p, {}).get("og_image", og) if base_data else og
                if og_base != og:
                    fails.append(f"og:image moved vs the prefix-off baseline: {og} != {og_base}")
                line = (f"{p}: HTTP {st} · hydrated {d['hydrated']} · <img> SSR {len(tags)} / DOM {len(d['imgs'])} · "
                        f"URLs asset {len(cls.get('asset', ()))} · page {len(cls.get('page', ()))} · 3p {len(cls.get('3p', ()))}"
                        f" · data {len(cls.get('data', ()))} · image requests asset {len(d['img_requests']['asset'])} / "
                        f"page {len(d['img_requests']['page'])} / 3p {len(d['img_requests']['3p'])} · loaded "
                        f"{sum(i['loaded'] for i in d['imgs'])}/{len(d['imgs'])} · {err_txt} · og:image vs og-file "
                        f"{'equal' if p in og_want and og_want[p] == og else ('n/a' if p not in og_want else 'MOVED')}"
                        f" · vs baseline {'equal' if og_base == og else 'MOVED'}")
            else:
                line = (f"{p}: HTTP {st} · hydrated {d['hydrated']} · <img> SSR {len(tags)} / DOM {len(d['imgs'])} · "
                        f"{err_txt if mode == 'off' else 'errors ' + str(d['errors']) + ' · local-only ' + str(len(d['errors_local_only']))} · og:image {og}")
                if mode == "off":
                    b = base_data["pages"].get(p)
                    if b is None:
                        fails.append("page missing in baseline")
                    else:
                        if b["ssr_img_tags"] != tags:
                            diff = [(x, y) for x, y in zip(b["ssr_img_tags"], tags) if x != y][:1]
                            fails.append(f"SSR <img> tags differ ({len(b['ssr_img_tags'])} vs {len(tags)}) {diff}")
                        if [i["attrs"] for i in b["imgs"]] != [i["attrs"] for i in d["imgs"]]:
                            fails.append("DOM <img> attribute lists differ")
                        if b["og_image"] != og:
                            fails.append(f"og:image differs: {og} != {b['og_image']}")
                        line += (f" · vs baseline: SSR tags {'identical' if b['ssr_img_tags'] == tags else 'DIFFER'}"
                                 f" · DOM attrs {'identical' if [i['attrs'] for i in b['imgs']] == [i['attrs'] for i in d['imgs']] else 'DIFFER'}"
                                 f" · og:image {'equal' if b['og_image'] == og else 'DIFFERS'}")
            ok = not fails
            ok_all &= ok
            out.append(f"{'PASS' if ok else 'FAIL'} {line}" + (f" · FAIL: {'; '.join(fails)}" if fails else ""))
            print(out[-1], file=sys.stderr, flush=True)
        if mode == "on":
            d = scan(br, base, SOFT_FROM, asset, soft_nav_to=HEAVY)
            data["soft_nav"] = d
            nav = d["soft_nav"] or {}
            art = [i for i in d["imgs"] if i["src"] and ("/images/" in i["src"] or "/diagrams/" in i["src"])]
            bad = [i["src"] for i in d["imgs"] for u in candidates(i["src"]) + candidates(i["srcset"])
                   if classify(u, base, asset) == "page"]
            fails = []
            if not nav.get("links_found"):
                fails.append(f"no <Link> to {HEAVY} on {SOFT_FROM}")
            if nav.get("full_reload", True):
                fails.append("not a client-side navigation")
            if len(art) < 10:
                fails.append(f"article images after soft nav {len(art)} < 10")
            if bad:
                fails.append(f"page-origin <img> after soft nav {len(bad)}: {bad[:3]}")
            if d["img_requests"]["page"]:
                fails.append(f"image requests through the page origin {len(d['img_requests']['page'])}")
            known = set(base_data["pages"].get(HEAVY, {}).get("errors", [])) if base_data else set()
            new_err = [e for e in d["errors"] if e not in known]
            if new_err:
                fails.append(f"NEW console/page errors {new_err[:2]}")
            ok_all &= not fails
            out.append(f"{'PASS' if not fails else 'FAIL'} soft nav {SOFT_FROM} → {HEAVY} (client render): {nav} · "
                       f"article <img> {len(art)} on asset origin {sum(1 for i in art if classify(i['src'], base, asset) == 'asset')} · "
                       f"image requests page {len(d['img_requests']['page'])} / asset {len(d['img_requests']['asset'])}"
                       + (f" · FAIL: {'; '.join(fails)}" if fails else ""))
            print(out[-1], file=sys.stderr, flush=True)
        br.close()
    if mode == "record":
        p = C.evidence_path("x4f-img-baseline", "json")
        p.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
        out.append(f"baseline saved: {p}")
    out.append("RESULT " + ("PASS" if ok_all else "FAIL") + f" (prefix {mode})")
    t = C.evidence_path(f"x4f-img-{label}", "txt")
    t.write_text("\n".join(out) + "\n", encoding="utf-8")
    if mode != "record":
        t.with_suffix(".json").write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    print("\n".join(out))
    print(f"evidence {t}")
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
