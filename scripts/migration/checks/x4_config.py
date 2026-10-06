"""BM-04 review: ADR-01 X4 config items (Helm decision on #3/#5, TASKS §0 X4-a…d) checked without a build.

  python3.13 scripts/migration/checks/x4_config.py          # writes a NEW x4-config-<HHMMSS>.txt under $EVIDENCE_DIR

1. next.config.ts as Next itself loads it (next/dist/server/config loadConfig, phase-production-build), per env:
     unset                                   → basePath /blog · assetPrefix not absolute (Next default = basePath) ·
                                               images.path /blog/_next/image · env.BLOG_BASE_PATH /blog · no redirects()
     BLOG_ASSET_PREFIX=P, VERCEL_ENV unset   → assetPrefix P · images.path P/_next/image          (X4-b, X4-c)
     BLOG_ASSET_PREFIX=P, VERCEL_ENV=production → same
     BLOG_ASSET_PREFIX=P, VERCEL_ENV=preview|development → off, like unset (Gate 1 / bm/* previews never get it)
     BLOG_ASSET_PREFIX=not-a-url | P/        → config load fails with the resolver message
     BLOG_BASE_PATH=/x                       → config load fails with the AC4d message
2. prefetch={false} (X4-d): every <Link …> element in src has prefetch={false}, except the 2 in src/app/not-found.tsx
   (left at the default on purpose); per-file counts == TASKS X4-d (sum 18).
Exit 0 = every line PASS.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

REPO = C.REPO
P = "https://ink-dopelab.vercel.app/blog"
BASE_ENV = {k: v for k, v in os.environ.items() if k not in ("BLOG_BASE_PATH", "BLOG_ASSET_PREFIX", "VERCEL_ENV")}
LOAD_JS = """
const loadConfig = require('next/dist/server/config').default;
loadConfig('phase-production-build', process.cwd(), { silent: true }).then(async (c) => {
  const r = typeof c.redirects === 'function' ? await c.redirects() : [];
  console.log('CFG ' + JSON.stringify({ basePath: c.basePath, assetPrefix: c.assetPrefix, imagesPath: c.images && c.images.path,
    env: c.env, redirects: r.length }));
}, (e) => { console.log('ERR ' + String(e && e.message || e).split('\\n')[0]); process.exit(1); });
"""
WANT_PREFETCH = {  # TASKS X4-d (paths after the T5 moves)
    "src/components/blog/article-card.tsx": 2,
    "src/components/blog/blog-content.tsx": 2,
    "src/components/layout/header.tsx": 5,
    "src/components/layout/mobile-nav.tsx": 4,
    "src/components/layout/footer.tsx": 1,
    "src/app/[locale]/[slug]/page.tsx": 1,
    "src/app/[locale]/tag/[tag]/page.tsx": 1,
    "src/app/[locale]/category/[category]/page.tsx": 1,
    "src/app/[locale]/page.tsx": 1,
}
DEFAULT_OK = {"src/app/not-found.tsx": 2}

out: list[str] = []
fails = 0


def rec(name: str, ok: bool, detail: str):
    global fails
    fails += 0 if ok else 1
    line = f"{'PASS' if ok else 'FAIL'} {name} · {detail}"
    out.append(line)
    print(line)


def load(extra: dict) -> tuple[dict | None, str]:
    r = subprocess.run(["node", "-e", LOAD_JS], cwd=REPO, env=dict(BASE_ENV, **extra), capture_output=True, text=True)
    txt = r.stdout + r.stderr
    for ln in txt.splitlines():
        if ln.startswith("CFG "):
            return json.loads(ln[4:]), ""
        if ln.startswith("ERR "):
            return None, ln[4:]
    return None, txt.strip().splitlines()[-1] if txt.strip() else "no output"


def off(c: dict | None) -> bool:
    return (c is not None and c["basePath"] == "/blog" and not str(c["assetPrefix"] or "").startswith("http")
            and c["imagesPath"] == "/blog/_next/image" and c["env"].get("BLOG_BASE_PATH") == "/blog" and c["redirects"] == 0)


def on(c: dict | None) -> bool:
    return (c is not None and c["basePath"] == "/blog" and c["assetPrefix"] == P and c["imagesPath"] == f"{P}/_next/image"
            and c["redirects"] == 0)


def main() -> int:
    head = C.header("x4_config.py (ADR-01 X4 items, review)") + [f"# repo {REPO}"]
    out.extend(head)
    print("\n".join(head))

    c, e = load({})
    rec("config unset → prefix off", off(c), json.dumps(c) if c else e)
    c, e = load({"BLOG_ASSET_PREFIX": P})
    rec("config prefix + VERCEL_ENV unset → on (local proof)", on(c), json.dumps(c) if c else e)
    c, e = load({"BLOG_ASSET_PREFIX": P, "VERCEL_ENV": "production"})
    rec("config prefix + VERCEL_ENV=production → on", on(c), json.dumps(c) if c else e)
    for env in ("preview", "development"):
        c, e = load({"BLOG_ASSET_PREFIX": P, "VERCEL_ENV": env})
        rec(f"config prefix + VERCEL_ENV={env} → off", off(c), json.dumps(c) if c else e)
    for bad in ("not-a-url", P + "/"):
        c, e = load({"BLOG_ASSET_PREFIX": bad, "VERCEL_ENV": "production"})
        rec(f"config BLOG_ASSET_PREFIX={bad!r} → load fails", c is None and "BLOG_ASSET_PREFIX=" in e and "is not supported" in e, e or json.dumps(c))
    c, e = load({"BLOG_BASE_PATH": "/x"})
    rec("config BLOG_BASE_PATH=/x → load fails", c is None and 'BLOG_BASE_PATH="/x" is not supported' in e, e or json.dumps(c))

    # prefetch audit
    got: dict[str, int] = {}
    without: dict[str, int] = {}
    for f in sorted((REPO / "src").rglob("*.tsx")):
        t = f.read_text(encoding="utf-8")
        rel = f.relative_to(REPO).as_posix()
        for m in re.finditer(r"<Link\b", t):
            end = t.find(">", m.end())
            # opening tag ends at the first ">" that is not part of "=>" inside {…}
            depth, i = 0, m.end()
            while i < len(t):
                ch = t[i]
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                elif ch == ">" and depth == 0:
                    end = i
                    break
                i += 1
            tag = t[m.start():end + 1]
            if re.search(r"\bprefetch=\{false\}", tag):
                got[rel] = got.get(rel, 0) + 1
            else:
                without[rel] = without.get(rel, 0) + 1
    rec("prefetch={false} per file == TASKS X4-d", got == WANT_PREFETCH, f"sum {sum(got.values())} · {got}")
    rec("<Link> without prefetch={false} only in not-found.tsx (2)", without == DEFAULT_OK, f"{without}")

    out.append(f"RESULT {'PASS' if fails == 0 else f'FAIL ({fails})'}")
    print(out[-1])
    p = C.evidence_path("x4-config", "txt")
    p.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"evidence {p}")
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
