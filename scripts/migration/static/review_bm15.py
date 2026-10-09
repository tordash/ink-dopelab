#!/usr/bin/env python3.13
"""BM-15 review checks (sdlc-code-reviewer): two gaps next to bm15.py. python3.13 stdlib only.

  python3.13 scripts/migration/static/review_bm15.py bodytext --a URL --b URL [--repo <tree>] [--label L]
  python3.13 scripts/migration/static/review_bm15.py variants --target URL [--label L]
  python3.13 scripts/migration/static/review_bm15.py redpair --target URL [--label L]

bodytext (AC4a gap): AC4a compares the <main> text only, so header / nav / footer text has no runtime proof on the
  137 en pages (the pixel diff covers 4 th pages). Here, per page (the N expected paths from <repo>/.velite/posts.json
  + the unknown tag + the unknown post), A vs B: equal status and equal visible <body> text (script, style, noscript
  and template content dropped, whitespace normalised). On B, <html lang> must equal the URL locale (en for
  /blog/en and /blog/en/*, else th).
variants (AC2 gap): AC2 judges only the headers of the Accept-Language / NEXT_LOCALE-cookie variants. A CDN cache
  key ignores both, so a render that depends on them would poison the cache. For every S18 path: the plain, the
  `Accept-Language: en-US,en;q=0.9` and the `Cookie: NEXT_LOCALE=en` responses have equal status, equal visible body
  text and <html lang> = the URL locale (bytes-equal is recorded as info).
redpair (shows the comparator can fail): runs the bodytext comparator on th vs en counterparts of the same page
  (/blog/about vs /blog/en/about, /blog/all vs /blog/en/all) and on a page vs itself. PASS = every th/en pair is
  reported as different and the self pair as equal.

Writes NEW review-<sub>-<label>-<HHMMSS>.{txt,tsv} files under $EVIDENCE_DIR; ends with "RESULT PASS|FAIL"; exit 0 = PASS.
"""
from __future__ import annotations

import argparse
import sys
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import bm15 as M  # noqa: E402  (also puts ../checks on sys.path and sets EVIDENCE_DIR's default)
C = M.C


def head(sub: str, argv: list[str], repo: Path | None) -> list[str]:
    return [ln.replace("# bm15.py", "# review_bm15.py", 1) for ln in M.head_lines(sub, argv, repo)]


SKIP = ("script", "style", "noscript", "template")


class _Body(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.lang = ""
        self.in_body = False
        self.skip = 0
        self.chunks: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "html":
            self.lang = dict(attrs).get("lang") or ""
        elif tag == "body":
            self.in_body = True
        elif tag in SKIP:
            self.skip += 1

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag in SKIP:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in SKIP and self.skip:
            self.skip -= 1
        elif tag == "body":
            self.in_body = False

    def handle_data(self, data):
        if self.in_body and not self.skip:
            t = M.WS.sub(" ", data).strip()
            if t:
                self.chunks.append(t)


def body(html: bytes) -> tuple[str, str]:
    """(html lang, visible <body> text, whitespace-normalised)."""
    p = _Body()
    p.feed(html.decode("utf-8", errors="replace"))
    p.close()
    return p.lang, " ".join(p.chunks)


def url_locale(path: str) -> str:
    return "en" if path == "/blog/en" or path.startswith("/blog/en/") else "th"


def first_diff(a: str, b: str) -> str:
    i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
    return f"@{i}: A={a[max(0, i - 40):i + 60]!r} · B={b[max(0, i - 40):i + 60]!r}"


def cmd_bodytext(a: argparse.Namespace, argv: list[str]) -> int:
    A, B = a.a.rstrip("/"), a.b.rstrip("/")
    repo = Path(a.repo).resolve()
    label = a.label or "bodytext"
    lines = head("bodytext", argv, repo) + [f"# A {A} · B {B}"]
    rows = M.expected_rows(M.load_posts(repo))
    paths = [r[2] for r in rows] + [M.UNKNOWN_TAG, M.UNKNOWN_POST]
    ra, rb = M.fetch_many(A, paths), M.fetch_many(B, paths)
    tsv, bad, lang_bad = [], [], []
    for p in paths:
        la, ta = body(ra[p][2])
        lb, tb = body(rb[p][2])
        same = ra[p][0] == rb[p][0] and ta == tb
        want_lang = url_locale(p)
        lang_ok = rb[p][0] != 200 or lb == want_lang
        if not same:
            bad.append(p)
        if not lang_ok:
            lang_bad.append(f"{p}: lang {lb!r} want {want_lang!r}")
        tsv.append([p, ra[p][0], rb[p][0], len(ta), len(tb), "equal" if same else "DIFF", lb, "ok" if lang_ok else "BAD"])
    en = [p for p in paths if url_locale(p) == "en"]
    lines.append(f"pages {len(paths)} (N {len(rows)} + unknown tag + unknown post) · en pages {len(en)} · "
                 f"body-text mismatches {len(bad)} · B <html lang> != URL locale {len(lang_bad)}")
    for p in bad[:8]:
        _, ta = body(ra[p][2])
        _, tb = body(rb[p][2])
        lines.append(f"    DIFF {p} status {ra[p][0]}/{rb[p][0]} {first_diff(ta, tb)}")
    lines += [f"    LANG {x}" for x in lang_bad[:8]]
    ok = not bad and not lang_bad
    pt = C.write_tsv(f"review-bodytext-{label}", lines[:2],
                     ["path", "status_a", "status_b", "chars_a", "chars_b", "body_text", "lang_b", "lang_vs_url"], tsv, [])
    lines.append(f"tsv {pt.name}")
    return _report("bodytext", label, lines, ok)


def _report(sub: str, label: str, lines: list[str], ok: bool) -> int:
    lines = lines + [f"RESULT {'PASS' if ok else 'FAIL'}"]
    p = C.evidence_path(f"review-{sub}-{label}", "txt")
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"evidence {p}")
    return 0 if ok else 1


def cmd_variants(a: argparse.Namespace, argv: list[str]) -> int:
    T = a.target.rstrip("/")
    label = a.label or "variants"
    lines = head("variants", argv, None) + [f"# target {T}"]
    tsv, bad = [], []
    bytes_eq = 0
    for p in M.S18:
        res = {v: M.req(T, p, headers=h) for v, h in M.VARIANTS}
        st0, _, b0 = res["plain"]
        lang0, t0 = body(b0)
        for v, (st, _h, b) in res.items():
            lang, t = body(b)
            good = st == st0 == 200 and t == t0 and lang == url_locale(p)
            bytes_eq += b == b0
            tsv.append([p, v, st, lang, len(t), "equal" if t == t0 else "DIFF", b == b0, "PASS" if good else "FAIL"])
            if not good:
                bad.append(f"{p} [{v}]: status {st}/{st0} · lang {lang!r} (want {url_locale(p)!r}) · text "
                           + ("equal" if t == t0 else first_diff(t0, t)))
    n = len(M.S18) * len(M.VARIANTS)
    lines.append(f"S18 × {len(M.VARIANTS)} variants: PASS {n - len(bad)}/{n} (status 200, visible body text == plain, "
                 f"<html lang> == URL locale) · bytes equal to plain {bytes_eq}/{n} (info)")
    lines += [f"    FAIL {x}" for x in bad[:10]]
    pt = C.write_tsv(f"review-variants-{label}", lines[:2],
                     ["path", "variant", "status", "lang", "chars", "text_vs_plain", "bytes_eq_plain", "verdict"], tsv, [])
    lines.append(f"tsv {pt.name}")
    return _report("variants", label, lines, not bad)


def cmd_redpair(a: argparse.Namespace, argv: list[str]) -> int:
    T = a.target.rstrip("/")
    label = a.label or "redpair"
    lines = head("redpair", argv, None) + [f"# target {T}"]
    ok = True
    for x, y, want_same in (("/blog/about", "/blog/en/about", False), ("/blog/all", "/blog/en/all", False),
                            ("/blog/about", "/blog/about", True)):
        _, tx = body(M.req(T, x)[2])
        _, ty = body(M.req(T, y)[2])
        same = tx == ty
        good = same == want_same
        ok &= good
        lines.append(f"{'PASS' if good else 'FAIL'} comparator on {x} vs {y}: {'equal' if same else 'different'} "
                     f"(want {'equal' if want_same else 'different'}) · chars {len(tx)}/{len(ty)}")
    return _report("redpair", label, lines, ok)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="sub", required=True)
    b = sub.add_parser("bodytext")
    b.add_argument("--a", required=True)
    b.add_argument("--b", required=True)
    b.add_argument("--repo", default=".")
    b.add_argument("--label")
    v = sub.add_parser("variants")
    v.add_argument("--target", required=True)
    v.add_argument("--label")
    r = sub.add_parser("redpair")
    r.add_argument("--target", required=True)
    r.add_argument("--label")
    a = ap.parse_args(argv)
    return {"bodytext": cmd_bodytext, "variants": cmd_variants, "redpair": cmd_redpair}[a.sub](a, argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
