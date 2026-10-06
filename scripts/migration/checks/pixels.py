"""BM-04 AC5 pixel diff (Playwright full-page shots, REQ AC5 settings verbatim).

  python3.13 scripts/migration/checks/pixels.py            # 4 pages x {390, 1280}: B0 (old paths) vs B1 (new paths) + noise floor
  python3.13 scripts/migration/checks/pixels.py --noise    # noise floor only: B0 home shot twice at 390 + 1280
  python3.13 scripts/migration/checks/pixels.py --a-url http://localhost:4420 --a-paths b1 \
      --b-url http://localhost:4420 --b-paths b1 --pages home,post   # any page map, e.g. B1 vs B1' (T11)

Settings: colorScheme light · reducedMotion reduce · locale th-TH · timezone Asia/Bangkok · DPR 1 ·
screenshot animations "disabled" + caret "hide" · GA/GTM, giscus.app, lab.dopelab.studio and /_vercel/insights aborted ·
ONE injected CSS (same on both sides) hides only the hero <video>, the hero <canvas> and <giscus-widget> ·
scroll to the bottom and back, document.fonts.ready, every visible <img> complete && naturalWidth > 0.
A pixel differs when max(|dR|,|dG|,|dB|) > 16. Unequal heights = FAIL (no crop).
Thresholds: pair diff <= 0.5 % · noise floor <= 0.1 % · broken images 0. They are never raised.
PNGs go to $EVIDENCE_DIR/png/ (git-ignored, never committed). Exit 0 = every row passes.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

PAGES = {
    "home": ("/th", "/blog"),
    "list": ("/th/blog", "/blog/all"),
    "post": ("/th/blog/90-percent-business-from-phone", "/blog/90-percent-business-from-phone"),
    "tag": ("/th/blog/tag/ai", "/blog/tag/ai"),
}
WIDTHS = {390: 844, 1280: 800}
CHANNEL_TOL = 16
PAIR_MAX = 0.5
NOISE_MAX = 0.1
BLOCK = re.compile(r"googletagmanager\.com|google-analytics\.com|analytics\.google\.com|giscus\.app|lab\.dopelab\.studio|/_vercel/insights")
MASK_CSS = "video, canvas, giscus-widget { visibility: hidden !important; }"

WAIT_IMGS_JS = """async () => {
  // "visible" = would be painted in the full-page shot: has a box, not hidden, inside the page width,
  // and not clipped away by an overflow ancestor (e.g. off-screen slides of a horizontal scroller).
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    let r = el.getBoundingClientRect();
    let L = r.left, R = r.right, T = r.top, B = r.bottom;
    if (R - L <= 0 || B - T <= 0) return false;
    L = Math.max(L, 0); R = Math.min(R, document.documentElement.clientWidth);
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (as.overflowX !== 'visible' || as.overflowY !== 'visible') {
        const ar = a.getBoundingClientRect();
        L = Math.max(L, ar.left); R = Math.min(R, ar.right); T = Math.max(T, ar.top); B = Math.min(B, ar.bottom);
      }
      if (R - L <= 0 || B - T <= 0) return false;
    }
    return true;
  };
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const pending = [...document.images].filter(i => visible(i) && !i.complete);
    if (pending.length === 0) break;
    await new Promise(r => setTimeout(r, 200));
  }
  return [...document.images].filter(i => visible(i) && !(i.complete && i.naturalWidth > 0)).map(i => i.currentSrc || i.src);
}"""

SCROLL_JS = """async () => {
  // globals.css sets html { scroll-behavior: smooth }: scroll with behavior "instant" so the shot never
  // catches a scroll still animating (the sticky header would land mid-page).
  const go = (y) => window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
    go(y); await new Promise(r => setTimeout(r, 120));
  }
  go(document.documentElement.scrollHeight); await new Promise(r => setTimeout(r, 300));
  go(0);
  const t0 = Date.now();
  while (window.scrollY !== 0 && Date.now() - t0 < 5000) { go(0); await new Promise(r => setTimeout(r, 50)); }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await document.fonts.ready;
  return window.scrollY;
}"""
TOP_JS = """async () => {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return window.scrollY;
}"""


def shoot(browser, url: str, width: int, out: Path, acao_origin: str | None = None) -> tuple[int, list[str], int]:
    ctx = browser.new_context(
        viewport={"width": width, "height": WIDTHS[width]},
        device_scale_factor=1,
        color_scheme="light",
        reduced_motion="reduce",
        locale="th-TH",
        timezone_id="Asia/Bangkok",
    )
    reached = []
    ctx.route("**/*", lambda r: r.abort() if BLOCK.search(r.request.url) else r.continue_())
    ctx.on("requestfinished", lambda req: reached.append(req.url) if BLOCK.search(req.url) else None)
    if acao_origin:  # T11 only: simulate the asset host's `access-control-allow-origin: *` (live Vercel sends it on
        # /_next/static/media; local `next start` does not), so cross-origin fonts load as they will in production
        def add_acao(route):
            r = route.fetch()
            route.fulfill(response=r, headers={**r.headers, "access-control-allow-origin": "*"})
        ctx.route(acao_origin.rstrip("/") + "/**", add_acao)
    page = ctx.new_page()
    resp = page.goto(url, wait_until="networkidle", timeout=90000)
    status = resp.status if resp else 0
    page.add_style_tag(content=MASK_CSS)
    page.evaluate(SCROLL_JS)
    broken = page.evaluate(WAIT_IMGS_JS)
    page.wait_for_load_state("networkidle")
    if page.evaluate(TOP_JS) != 0:
        broken = broken + ["<scrollY not 0 before the shot>"]
    page.screenshot(path=str(out), full_page=True, animations="disabled", caret="hide")
    ctx.close()
    return status, broken, len(reached)


def diff(a: Path, b: Path, out: Path) -> tuple[int, int, float | None]:
    ia = np.asarray(Image.open(a).convert("RGB"), dtype=np.int16)
    ib = np.asarray(Image.open(b).convert("RGB"), dtype=np.int16)
    ha, hb = ia.shape[0], ib.shape[0]
    if ia.shape != ib.shape:
        return ha, hb, None
    mask = np.abs(ia - ib).max(axis=2) > CHANNEL_TOL
    ratio = float(mask.mean() * 100.0)
    vis = np.asarray(Image.open(a).convert("RGB")).copy()
    vis[mask] = [255, 0, 255]
    Image.fromarray(vis).save(out)
    return ha, hb, ratio


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--noise", action="store_true", help="noise floor only (B0 home twice)")
    ap.add_argument("--no-noise", action="store_true", help="skip the noise-floor rows")
    ap.add_argument("--pages", default="home,list,post,tag")
    ap.add_argument("--widths", default="390,1280")
    ap.add_argument("--a-url", default=C.B0_URL)
    ap.add_argument("--a-paths", choices=["b0", "b1"], default="b0")
    ap.add_argument("--b-url", default=C.B1_URL)
    ap.add_argument("--b-paths", choices=["b0", "b1"], default="b1")
    ap.add_argument("--label", default="pixels")
    ap.add_argument("--acao-origin", help="T11: add access-control-allow-origin: * to responses from this origin (asset host)")
    a = ap.parse_args()
    widths = [int(w) for w in a.widths.split(",")]
    pages = [p for p in a.pages.split(",") if p]
    png = C.EVIDENCE_DIR / "png"
    png.mkdir(parents=True, exist_ok=True)
    tag = C.stamp()
    jobs = []  # (kind, page, width, urlA, urlB)
    if not a.noise:
        for p in pages:
            pa = PAGES[p][0 if a.a_paths == "b0" else 1]
            pb = PAGES[p][0 if a.b_paths == "b0" else 1]
            for w in widths:
                jobs.append(("pair", p, w, a.a_url + pa, a.b_url + pb))
    if a.noise or not a.no_noise:
        for w in widths:
            u = C.B0_URL + PAGES["home"][0]
            jobs.append(("noise", "home", w, u, u))
    rows, ok_all, reached_total = [], True, 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for kind, p, w, ua, ub in jobs:
            fa = png / f"{a.label}-{tag}-{kind}-{p}-{w}-A.png"
            fb = png / f"{a.label}-{tag}-{kind}-{p}-{w}-B.png"
            fd = png / f"{a.label}-{tag}-{kind}-{p}-{w}-diff.png"
            sa, ba, ra = shoot(browser, ua, w, fa, a.acao_origin)
            sb, bb, rb = shoot(browser, ub, w, fb, a.acao_origin)
            reached_total += ra + rb
            ha, hb, ratio = diff(fa, fb, fd)
            limit = NOISE_MAX if kind == "noise" else PAIR_MAX
            broken = len(ba) + len(bb)
            ok = sa == 200 and sb == 200 and ha == hb and ratio is not None and ratio <= limit and broken == 0
            ok_all &= ok
            rows.append([kind, p, w, ua, ub, sa, sb, ha, hb,
                         "n/a (heights differ)" if ratio is None else f"{ratio:.4f}", f"<= {limit}", broken,
                         "PASS" if ok else "FAIL", ";".join(ba + bb) or "-"])
        browser.close()
    cols = ["kind", "page", "width", "url_A", "url_B", "status_A", "status_B", "heightA", "heightB", "diff%", "limit%", "broken_imgs", "result", "broken_srcs"]
    tail = [f"blocked-host requests reached {reached_total}", f"PNGs in {png} (prefix {a.label}-{tag})",
            "RESULT " + ("PASS" if ok_all and reached_total == 0 else "FAIL")]
    head = C.header("pixels.py (AC5)")
    p = C.write_tsv("ac5-pixels", head, cols, rows, tail)
    print("\n".join(head))
    print("\t".join(["kind", "page", "width", "heightA", "heightB", "diff%", "broken_imgs", "result"]))
    for r in rows:
        print("\t".join(str(r[i]) for i in (0, 1, 2, 7, 8, 9, 11, 12)))
    print(f"evidence {p}")
    print("\n".join(tail))
    return 0 if ok_all and reached_total == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
