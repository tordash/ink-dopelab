"""Shared helpers for the BM-04 check scripts (local only; python3.13, stdlib + playwright/PIL/numpy).

Env:
  B0_URL        main-side build      (default http://localhost:4410)
  B1_URL        branch build         (default http://localhost:4420)
  BM03_DIR      BM-03 deliverables/blog-migration (read-only; urlmap.py + url-rules.json)
  EVIDENCE_DIR  where every check writes a NEW <prefix>-<HHMMSS>.{tsv,txt} file
"""
from __future__ import annotations

import hashlib
import http.client
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
REPO = HERE.parents[2]  # <ink worktree>/scripts/migration/checks -> <ink worktree>

B0_URL = os.environ.get("B0_URL", "http://localhost:4410").rstrip("/")
B1_URL = os.environ.get("B1_URL", "http://localhost:4420").rstrip("/")
BM03_DIR = Path(os.environ.get(
    "BM03_DIR",
    str(Path.home() / "Projects/dopelab/.claude/worktrees/bm-BM-03-url-map/deliverables/blog-migration"),
))
EVIDENCE_DIR = Path(os.environ.get(
    "EVIDENCE_DIR",
    str(Path.home() / "Projects/dopelab/ψ/writing/blog-migration/stories/BM-04/evidence"),
))
URLMAP_PY = BM03_DIR / "tools" / "urlmap.py"
URL_RULES = BM03_DIR / "data" / "url-rules.json"

_urlmap = None
_rules = None


def urlmap():
    """Import BM-03 urlmap read-only from BM03_DIR/tools."""
    global _urlmap
    if _urlmap is None:
        sys.path.insert(0, str(BM03_DIR / "tools"))
        import urlmap as m  # noqa: E402
        _urlmap = m
    return _urlmap


def rules():
    global _rules
    if _rules is None:
        _rules = urlmap().load_rules(URL_RULES, landing_mode="i")
    return _rules


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def header(tool: str) -> list[str]:
    """Report header: tool, time, targets, BM-03 oracle hashes."""
    return [
        f"# {tool} · {time.strftime('%Y-%m-%d %H:%M:%S %z')}",
        f"# B0_URL={B0_URL} · B1_URL={B1_URL} · repo={REPO}",
        f"# urlmap.py sha256 {sha256(URLMAP_PY)} · url-rules.json sha256 {sha256(URL_RULES)} · BM03_DIR={BM03_DIR}",
    ]


def fetch(base: str, raw_path: str, method: str = "GET", headers: dict | None = None, timeout: float = 60.0):
    """No-follow request. ``raw_path`` is sent byte for byte (keeps %2F / %20 / Thai %XX).

    Returns (status, {lower-case header: value}, body bytes).
    """
    u = urlsplit(base)
    conn = http.client.HTTPConnection(u.hostname, u.port or 80, timeout=timeout)
    try:
        conn.putrequest(method, raw_path, skip_accept_encoding=True)
        conn.putheader("Host", u.netloc)
        conn.putheader("User-Agent", "bm04-checks/1.0")
        conn.putheader("Accept-Encoding", "identity")
        for k, v in (headers or {}).items():
            conn.putheader(k, v)
        conn.endheaders()
        r = conn.getresponse()
        body = b"" if method == "HEAD" else r.read()
        hdrs = {k.lower(): v for k, v in r.getheaders()}
        return r.status, hdrs, body
    finally:
        conn.close()


def stamp() -> str:
    return time.strftime("%H%M%S")


def evidence_path(prefix: str, ext: str) -> Path:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    p = EVIDENCE_DIR / f"{prefix}-{stamp()}.{ext}"
    n = 1
    while p.exists():  # never overwrite an earlier evidence file
        p = EVIDENCE_DIR / f"{prefix}-{stamp()}-{n}.{ext}"
        n += 1
    return p


def write_tsv(prefix: str, head: list[str], cols: list[str], rows: list[list], tail: list[str]) -> Path:
    p = evidence_path(prefix, "tsv")
    with p.open("w", encoding="utf-8") as fh:
        for h in head:
            fh.write(h + "\n")
        fh.write("\t".join(cols) + "\n")
        for r in rows:
            fh.write("\t".join(str(x) for x in r) + "\n")
        for t in tail:
            fh.write("# " + t + "\n")
    return p


def read_tsv(p: Path) -> list[dict]:
    lines = [ln for ln in p.read_text(encoding="utf-8").split("\n") if ln and not ln.startswith("#")]
    cols = lines[0].split("\t")
    return [dict(zip(cols, ln.split("\t"))) for ln in lines[1:]]


def path_of(dest: str) -> str:
    """Absolute dest URL -> path (+?query +#frag), no decoding."""
    s = urlsplit(dest)
    return s.path + (("?" + s.query) if s.query else "") + (("#" + s.fragment) if s.fragment else "")
