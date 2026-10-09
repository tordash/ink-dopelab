"""BM-04 AC6: features still work on B1 (Playwright, analytics blocked for the whole run).

  python3.13 scripts/migration/checks/features.py        # one line per check, PASS/FAIL; writes a NEW ac6-features-*.tsv

Aborted for the whole run (and asserted: 0 reached): googletagmanager.com, google-analytics.com, analytics.google.com,
giscus.app, lin.ee, lab.dopelab.studio, /_vercel/insights. Test traffic never reaches G-SVY8Q547WJ.
"No redirect in the chain" = every same-origin response with resource type document/fetch recorded from the click on
has a status outside 300–399, page.url ends with the expected path, then page.goto(expected) → 200 with no redirect.
Hydration signal = the theme toggle's aria-label (ThemeToggle renders it only after mount).
Exit 0 = every line PASS and 0 blocked-host requests reached.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

B1 = C.B1_URL
BLOCK = re.compile(r"googletagmanager\.com|google-analytics\.com|analytics\.google\.com|giscus\.app|lin\.ee|lab\.dopelab\.studio|/_vercel/insights")
THAI_TAG = "/blog/tag/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%95%E0%B8%A5%E0%B8%B2%E0%B8%94"
SWITCH_ROWS = [  # (start, expected landing, source)
    ("/blog/agent-teams-11-ai", "/blog/en/agent-teams-11-ai", "REQ"),
    ("/blog/anthropic-ipo-350b", "/blog/en", "REQ"),
    ("/blog/en/agent-teams-11-ai", "/blog/agent-teams-11-ai", "REQ"),
    (THAI_TAG, "/blog/en", "REQ"),
    ("/blog/all", "/blog/en/all", "REQ"),
    ("/blog/about", "/blog/en/about", "REQ"),
    ("/blog/tag/karpathy", "/blog/en/tag/karpathy", "SPEC"),
    ("/blog/en/tag/karpathy", "/blog/tag/karpathy", "SPEC"),
    ("/blog/tag/A%2FB-test", "/blog/en", "SPEC"),
    ("/blog/category/AI%20News", "/blog/en/category/AI%20News", "SPEC"),
    ("/blog/en", "/blog", "SPEC"),
]
POST = "/blog/anthropic-ipo-350b"
LINE_HREF = "https://lin.ee/zV8EwXv?utm_source=ink&utm_medium=post_cta&utm_campaign=anthropic-ipo-350b"
STUDIO_HREF = "https://dopelab.studio?utm_source=ink&utm_medium=post_cta&utm_campaign=anthropic-ipo-350b"
HYDRATED = 'button[aria-label="Toggle theme"]'
POST_PATH = re.compile(r"^/blog/(en/)?[^/]+$")

results: list[list] = []
reached: list[str] = []


def rec(check: str, ok: bool, detail: str):
    results.append([check, "PASS" if ok else "FAIL", detail])
    print(f"{'PASS' if ok else 'FAIL'}  {check}  ·  {detail}")


def new_ctx(browser, width=1280, height=800):
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="th-TH", timezone_id="Asia/Bangkok",
                              color_scheme="light", reduced_motion="reduce")
    ctx.route("**/*", lambda r: r.abort() if BLOCK.search(r.request.url) else r.continue_())
    ctx.on("requestfinished", lambda req: reached.append(req.url) if BLOCK.search(req.url) else None)
    return ctx


def track(page) -> list:
    log: list = []

    def on_resp(r):
        if r.request.resource_type in ("document", "fetch") and r.url.startswith(B1):
            log.append((r.status, r.url))
    page.on("response", on_resp)
    return log


def open_hydrated(page, path: str):
    # domcontentloaded + the hydration signal, then a bounded networkidle: a stuck local image-optimizer request
    # (seen once on `next start` after an aborted AVIF request; cleared by a server restart) must not time the check out.
    resp = page.goto(B1 + path, wait_until="domcontentloaded", timeout=90000)
    page.wait_for_selector(HYDRATED, timeout=30000)
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:  # noqa: BLE001
        pass
    return resp


def same_path(url: str, expected: str) -> bool:
    return unquote(urlsplit(url).path) == unquote(expected)


def landing_ok(page, expected: str) -> tuple[bool, str]:
    resp = page.goto(B1 + expected, wait_until="domcontentloaded", timeout=90000)
    st = resp.status if resp else 0
    redirected = resp.request.redirected_from is not None if resp else True
    return st == 200 and not redirected, f"goto {expected} → {st}{' (redirected)' if redirected else ''}"


def nav_after_click(page, log: list, click, start_url: str) -> tuple[list, str]:
    log.clear()
    click()
    page.wait_for_url(lambda u: u != start_url, timeout=20000)
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:  # noqa: BLE001
        pass
    three = [f"{s} {u}" for s, u in log if 300 <= s < 400]
    return three, page.url


def check_switcher(browser):
    ctx = new_ctx(browser)
    for start, exp, src in SWITCH_ROWS:
        page = ctx.new_page()
        log = track(page)
        try:
            open_hydrated(page, start)
            three, url = nav_after_click(page, log, lambda: page.click('button[aria-label="Switch language"]'), page.url)
            got = urlsplit(url).path
            ok_path = same_path(url, exp)
            ok_land, land = landing_ok(page, exp)
            rec(f"switcher {start} → {exp} ({src})", ok_path and not three and ok_land,
                f"landed {got} · 3xx in chain {len(three)}{(' ' + ' | '.join(three)) if three else ''} · {land}")
        except Exception as e:  # noqa: BLE001
            rec(f"switcher {start} → {exp} ({src})", False, f"error {type(e).__name__}: {str(e).splitlines()[0][:160]}")
        page.close()
    ctx.close()


def check_post_cta(browser):
    ctx = new_ctx(browser)
    page = ctx.new_page()
    open_hydrated(page, POST)
    line = page.locator('aside a[href^="https://lin.ee"]').first.get_attribute("href")
    studio = page.locator('aside a[href^="https://dopelab.studio"]').first.get_attribute("href")
    rec("PostCta LINE href exact", line == LINE_HREF, line or "-")
    rec("PostCta secondary href exact", studio == STUDIO_HREF, studio or "-")
    page.wait_for_function("typeof window.gtag === 'function'", timeout=20000)
    popups = []
    page.on("popup", lambda p: popups.append(p))
    page.locator('aside a[href^="https://lin.ee"]').first.click()
    page.wait_for_timeout(800)
    for p in popups:
        p.close()
    dl = page.evaluate("() => (window.dataLayer || []).map(x => Array.from(x))")
    hit = [x for x in dl if len(x) >= 3 and x[0] == "event" and x[1] == "line_click"]
    want = {"location": "post_cta", "post": "anthropic-ipo-350b"}
    rec("PostCta line_click in dataLayer", bool(hit) and hit[-1][2] == want,
        f"{hit[-1] if hit else 'no line_click entry'} (popups {len(popups)}, aborted)")
    ctx.close()


def check_search(browser):
    for loc, home, query in (("th", "/blog", "Claude"), ("en", "/blog/en", "agent")):
        ctx = new_ctx(browser)
        page = ctx.new_page()
        log = track(page)
        try:
            open_hydrated(page, home)
            page.click("header button:has(kbd)")
            page.fill("div.fixed input[type=text]", query)
            first = page.locator("div.fixed div.overflow-y-auto > button").first
            first.wait_for(timeout=10000)
            three, url = nav_after_click(page, log, first.click, page.url)
            path = urlsplit(url).path
            shape = POST_PATH.match(path) is not None and (path.startswith("/blog/en/") == (loc == "en"))
            fetch_200 = any(s == 200 and urlsplit(u).path == path for s, u in log)
            ok_land, land = landing_ok(page, path)
            rec(f"header search {loc} '{query}' → first result", shape and not three and fetch_200 and ok_land,
                f"landed {path} · nav response 200 {'yes' if fetch_200 else 'NO'} · 3xx in chain {len(three)} · {land}")
        except Exception as e:  # noqa: BLE001
            rec(f"header search {loc} '{query}' → first result", False, f"error {type(e).__name__}: {str(e).splitlines()[0][:160]}")
        ctx.close()


def check_list_filter(browser):
    ctx = new_ctx(browser)
    page = ctx.new_page()
    open_hydrated(page, "/blog/all")
    count = "() => document.querySelectorAll('main a.group[href]').length"
    n = page.evaluate(count)
    page.fill("main input[type=text]", "Karpathy")
    page.wait_for_timeout(800)
    m = page.evaluate(count)
    rec("list filter /blog/all 'Karpathy'", 0 < m < n, f"cards {n} → {m}")
    ctx.close()


def check_toc(browser):
    ctx = new_ctx(browser, 1280, 800)
    page = ctx.new_page()
    open_hydrated(page, POST)
    a = page.locator("aside nav a[href^='#']").first
    href = a.get_attribute("href")
    a.click()
    page.wait_for_timeout(500)
    h = page.evaluate("() => location.hash")
    exists = page.evaluate("(h) => !!document.getElementById(decodeURIComponent(h.slice(1)))", h)
    rec("TOC first item sets hash", unquote(h) == unquote(href or "") and exists,
        f"href {href} · location.hash (decoded) {unquote(h)} · element exists {exists}")
    ctx.close()


def check_theme(browser):
    ctx = new_ctx(browser)
    page = ctx.new_page()
    open_hydrated(page, "/blog")
    dark = "() => document.documentElement.classList.contains('dark')"
    d0 = page.evaluate(dark)
    page.click(HYDRATED)
    page.wait_for_timeout(300)
    d1 = page.evaluate(dark)
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector(HYDRATED)
    page.wait_for_timeout(300)
    d2 = page.evaluate(dark)
    page.click(HYDRATED)
    page.wait_for_timeout(300)
    d3 = page.evaluate(dark)
    rec("theme default light → toggle dark → reload dark → toggle light", (d0, d1, d2, d3) == (False, True, True, False),
        f"dark: fresh {d0} · toggle {d1} · reload {d2} · toggle {d3}")
    ctx.close()


def check_post_extras(browser):
    ctx = new_ctx(browser)
    page = ctx.new_page()
    open_hydrated(page, POST)
    forms = page.evaluate("() => document.querySelectorAll('form').length")
    emails = page.evaluate("() => document.querySelectorAll('input[type=email]').length")
    rec("newsletter hidden on post", forms == 0 and emails == 0, f"form {forms} · input[type=email] {emails}")
    hrefs = page.evaluate("""() => { const h = [...document.querySelectorAll('section h2')].find(x => /บทความที่เกี่ยวข้อง|Related Articles/.test(x.textContent));
        return h ? [...h.closest('section').querySelectorAll('a[href]')].map(a => a.getAttribute('href')) : []; }""")
    st = C.fetch(B1, hrefs[0])[0] if hrefs else 0
    rec("related posts ≥ 1, first href 200", len(hrefs) >= 1 and st == 200, f"related {len(hrefs)} · {hrefs[0] if hrefs else '-'} → {st}")
    page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(800)
    gw = page.evaluate("() => { const g = document.querySelector('giscus-widget'); return g ? g.getAttribute('mapping') : null; }")
    rec("giscus widget mapping=pathname", gw == "pathname", f"giscus-widget mapping={gw}")
    srcs = page.evaluate("() => [...document.querySelectorAll('script[src*=insights]')].map(s => s.getAttribute('src'))")
    rec("Vercel Analytics script under /blog/_vercel/insights/", bool(srcs) and all(s.startswith("/blog/_vercel/insights/") for s in srcs),
        f"script[src*=insights] {srcs}")
    ctx.close()
    # B0 baseline for the same check (does `next start` inject the script locally at all?)
    ctx0 = browser.new_context()
    ctx0.route("**/*", lambda r: r.abort() if BLOCK.search(r.request.url) else r.continue_())
    ctx0.on("requestfinished", lambda req: reached.append(req.url) if BLOCK.search(req.url) else None)
    p0 = ctx0.new_page()
    p0.goto(C.B0_URL + "/th", wait_until="networkidle", timeout=90000)
    s0 = p0.evaluate("() => [...document.querySelectorAll('script[src*=insights]')].map(s => s.getAttribute('src'))")
    print(f"info  B0 {C.B0_URL}/th script[src*=insights] {s0}")
    results.append(["info: B0 insights script", "INFO", f"{C.B0_URL}/th {s0}"])
    ctx0.close()


def check_mobile_nav(browser):
    ctx = new_ctx(browser, 390, 844)
    page = ctx.new_page()
    open_hydrated(page, "/blog")
    page.click('button[aria-label="Menu"]')
    page.wait_for_timeout(300)
    hrefs = page.evaluate("() => [...document.querySelectorAll('div.md\\\\:hidden nav a')].map(a => a.getAttribute('href'))")
    want = ["/blog", "/blog/all", "/blog/about", "/blog/contact"]
    rec("mobile nav at 390", hrefs == want, f"{hrefs}")
    ctx.close()


def main() -> int:
    head = C.header("features.py (AC6)") + [f"# target {B1}"]
    print("\n".join(head))
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for fn in (check_switcher, check_post_cta, check_search, check_list_filter, check_toc, check_theme,
                   check_post_extras, check_mobile_nav):
            try:
                fn(browser)
            except Exception as e:  # noqa: BLE001
                rec(fn.__name__, False, f"error {type(e).__name__}: {str(e).splitlines()[0][:200]}")
        browser.close()
    checks = [r for r in results if r[1] != "INFO"]
    npass = sum(1 for r in checks if r[1] == "PASS")
    ok = npass == len(checks) and not reached
    tail = [f"checks PASS {npass}/{len(checks)}", f"analytics requests reached {len(reached)} {reached[:5] if reached else ''}".rstrip(),
            "RESULT " + ("PASS" if ok else "FAIL")]
    p = C.write_tsv("ac6-features", head, ["check", "result", "detail"], results, tail)
    print(f"evidence {p}")
    print("\n".join(tail))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
