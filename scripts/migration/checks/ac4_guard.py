"""BM-04 AC4 (review): the reserved-slug guard, automated end to end without touching content/ (no cp, no rm).

  python3.13 scripts/migration/checks/ac4_guard.py            # writes a NEW ac4-guard-<HHMMSS>.txt under $EVIDENCE_DIR

The coder ran AC4 as a manual procedure (cp fixture → npm run build → rm). This script runs the same cases in a
throwaway MIRROR of the tree (tempfile, auto-cleaned): the guard only reads names, so the mirror holds
  package.json · scripts/migration/{check-reserved-slugs.mjs,reserved-slugs.json} · src/middleware.ts (copies) and
  public/*, src/app/*, src/app/[locale]/*, content/posts/**/*.mdx (same names; files empty)
and the fixture is written there, never under the real content/.

  M0  mirror fidelity: guard output lines 2–4 in the mirror == in the real tree, exit 0
  A   content/posts/th/all.mdx            → `npm run build` exit ≠ 0, no "[VELITE]" line, RESERVED … (listed …)
  B1  content/posts/en/Tag.mdx (case)     → same, RESERVED content/posts/en/Tag.mdx -> tag
  B2  content/posts/th/deploy-check.txt.mdx (derived) → RESERVED (derived from public/deploy-check.txt) AND DOTTED
  ALL the three together                  → all three reported in one run
  M   an extra public/newdir/ not in the matcher → MATCHER line (SPEC D9 addition)
  C   the real tree: guard RESULT PASS exit 0 · th-ai-passport-free-ai-tools is a real post and not flagged
  D   BLOG_BASE_PATH=/x npm run build (real tree) → exit ≠ 0 with the resolver message; content/ + public/static unchanged
  P   parity: vendored reserved_slugs == url-rules.json reserved_slugs ($BM03_DIR) · guard lines 2–4 ==
      BM-03 check_redirects.py --check-reserved --ink-repo <tree> lines 2–4
  G   package.json build runs the guard first: "node scripts/migration/check-reserved-slugs.mjs && velite && next build"
Exit 0 = every case passes.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

REPO = C.REPO
GUARD = "scripts/migration/check-reserved-slugs.mjs"
FIXTURE = REPO / "scripts/migration/fixtures/reserved-post.mdx"
BUILD = "node scripts/migration/check-reserved-slugs.mjs && velite && next build"
ENV = {k: v for k, v in os.environ.items() if k not in ("BLOG_BASE_PATH", "BLOG_ASSET_PREFIX", "VERCEL_ENV")}

out: list[str] = []
fails = 0


def rec(name: str, ok: bool, detail: str):
    global fails
    fails += 0 if ok else 1
    line = f"{'PASS' if ok else 'FAIL'} {name} · {detail}"
    out.append(line)
    print(line)


def run(cmd: list[str], cwd: Path, env: dict | None = None) -> tuple[int, str]:
    r = subprocess.run(cmd, cwd=cwd, env=env or ENV, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr)


def mirror(dst: Path):
    for rel in ("package.json", GUARD, "scripts/migration/reserved-slugs.json", "src/middleware.ts"):
        (dst / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REPO / rel, dst / rel)
    for rel in ("public", "src/app", "src/app/[locale]"):
        (dst / rel).mkdir(parents=True, exist_ok=True)
        for e in (REPO / rel).iterdir():
            if e.is_dir():
                (dst / rel / e.name).mkdir(exist_ok=True)
            else:
                (dst / rel / e.name).touch()
    for f in (REPO / "content/posts").rglob("*.mdx"):
        t = dst / f.relative_to(REPO)
        t.parent.mkdir(parents=True, exist_ok=True)
        t.touch()


def lines_2_4(text: str) -> list[str]:
    return text.splitlines()[1:4]


def guard_lines(text: str) -> list[str]:
    return [ln for ln in text.splitlines() if ln.startswith("BM-04 reserved-slug guard")
            or ln.startswith(("slugs ", "  posts per", "  derived from", "  dotted"))]


def case(name: str, adds: list[str], want: list[str], extra_dirs: list[str] = ()):
    with tempfile.TemporaryDirectory(prefix="bm04-ac4-") as td:
        m = Path(td)
        mirror(m)
        for rel in adds:
            (m / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(FIXTURE, m / rel)
        for d in extra_dirs:
            (m / d).mkdir(parents=True, exist_ok=True)
        code, text = run(["npm", "run", "build"], m)
        velite = "[VELITE]" in text
        missing = [w for w in want if w not in text]
        ok = code != 0 and not velite and not missing
        viol = [ln for ln in text.splitlines() if ln.startswith(("RESERVED ", "DOTTED ", "MATCHER "))]
        rec(name, ok, f"npm run build exit {code} · [VELITE] line {'yes' if velite else 'no'} · "
                      f"expected lines missing {len(missing)}{(' ' + repr(missing)) if missing else ''}")
        out.extend("    " + v for v in viol)


def main() -> int:
    head = C.header("ac4_guard.py (AC4, review)") + [f"# repo {REPO} · HEAD {run(['git', 'rev-parse', '--short', 'HEAD'], REPO)[1].strip()}"]
    out.extend(head)
    print("\n".join(head))

    # G: build order
    pkg = json.loads((REPO / "package.json").read_text(encoding="utf-8"))
    rec("G package.json build runs the guard before velite", pkg["scripts"]["build"] == BUILD, repr(pkg["scripts"]["build"]))

    # C: real tree
    code, real = run(["node", GUARD], REPO)
    real_posts = sorted(p.stem for p in (REPO / "content/posts").rglob("th-ai-passport-free-ai-tools.mdx"))
    flagged = "th-ai-passport-free-ai-tools" in "\n".join(ln for ln in real.splitlines() if ln.startswith(("RESERVED", "DOTTED")))
    rec("C real tree guard PASS", code == 0 and "RESULT PASS exit 0" in real and bool(real_posts) and not flagged,
        f"exit {code} · th-ai-passport-free-ai-tools present {bool(real_posts)} flagged {flagged}")
    out.extend("    " + ln for ln in guard_lines(real))

    # M0: mirror fidelity
    with tempfile.TemporaryDirectory(prefix="bm04-ac4-") as td:
        m = Path(td)
        mirror(m)
        code, mt = run(["node", GUARD], m)
        rec("M0 mirror == real tree (guard lines 2–4)", code == 0 and lines_2_4(mt) == lines_2_4(real),
            f"exit {code} · mirror {lines_2_4(mt)}")

    case("A th/all.mdx (listed)", ["content/posts/th/all.mdx"],
         ["RESERVED content/posts/th/all.mdx -> all (listed in url-rules.json reserved_slugs; derived from src/app/[locale]/all)",
          "RESULT FAIL exit 1"])
    case("B1 en/Tag.mdx (case)", ["content/posts/en/Tag.mdx"],
         ["RESERVED content/posts/en/Tag.mdx -> tag (listed in url-rules.json reserved_slugs; derived from src/app/[locale]/tag)",
          "RESULT FAIL exit 1"])
    case("B2 th/deploy-check.txt.mdx (derived + dotted)", ["content/posts/th/deploy-check.txt.mdx"],
         ["RESERVED content/posts/th/deploy-check.txt.mdx -> deploy-check.txt (derived from public/deploy-check.txt)",
          "DOTTED content/posts/th/deploy-check.txt.mdx -> deploy-check.txt", "RESULT FAIL exit 1"])
    case("ALL three together (every violation reported)",
         ["content/posts/th/all.mdx", "content/posts/en/Tag.mdx", "content/posts/th/deploy-check.txt.mdx"],
         ["RESERVED content/posts/th/all.mdx -> all", "RESERVED content/posts/en/Tag.mdx -> tag",
          "RESERVED content/posts/th/deploy-check.txt.mdx -> deploy-check.txt", "DOTTED content/posts/th/deploy-check.txt.mdx",
          "collisions 3", "RESULT FAIL exit 1"])
    case("M public/newdir/ missing from the matcher", [], ["MATCHER public/newdir/ is not excluded", "RESULT FAIL exit 1"],
         extra_dirs=["public/newdir"])

    # D: BLOG_BASE_PATH=/x on the real tree (fails at velite config load; nothing written)
    def snap():
        st = sorted(p.name for p in (REPO / "public/static").iterdir())
        cs = run(["git", "status", "--porcelain", "content/"], REPO)[1]
        return st, cs
    before = snap()
    code, xt = run(["npm", "run", "build"], REPO, env=dict(ENV, BLOG_BASE_PATH="/x"))
    after = snap()
    msg = 'BLOG_BASE_PATH="/x" is not supported: MDX content links are rewritten for "/blog" only (BM-04).'
    rec("D BLOG_BASE_PATH=/x npm run build fails with the resolver message", code != 0 and msg in xt and before == after,
        f"exit {code} · message {'yes' if msg in xt else 'NO'} · public/static {len(before[0])}→{len(after[0])} files · "
        f"content/ status {'clean' if not after[1].strip() else 'DIRTY'} · next build reached {'yes' if 'Creating an optimized' in xt else 'no'}")

    # content/ untouched by this script
    cs = run(["git", "status", "--porcelain", "content/"], REPO)[1]
    rec("git status --porcelain content/ empty", cs.strip() == "", repr(cs.strip()) or "''")

    # P: parity with BM-03
    vend = json.loads((REPO / "scripts/migration/reserved-slugs.json").read_text(encoding="utf-8"))["reserved_slugs"]
    rules = json.loads(C.URL_RULES.read_text(encoding="utf-8"))
    rs = rules.get("reserved_slugs")
    rec("P1 vendored reserved_slugs == url-rules.json reserved_slugs", vend == rs,
        f"vendored {len(vend)} · url-rules {len(rs) if rs else '?'} · url-rules sha256 {C.sha256(C.URL_RULES)[:8]}")
    code3, bm03 = run([sys.executable, str(C.BM03_DIR / "tools/check_redirects.py"), "--check-reserved", "--ink-repo", str(REPO)], REPO)
    same = lines_2_4(real) == lines_2_4(bm03)
    rec("P2 guard lines 2–4 == BM-03 --check-reserved lines 2–4", code3 == 0 and same,
        f"BM-03 exit {code3} · BM-03 {lines_2_4(bm03)}")

    out.append(f"RESULT {'PASS' if fails == 0 else f'FAIL ({fails})'}")
    print(out[-1])
    p = C.evidence_path("ac4-guard", "txt")
    p.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"evidence {p}")
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
