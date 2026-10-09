"""BM-04 AC3: the MDX rewrite is correct (urlmap oracle), complete (replay + file set) and leaves nothing behind.

  python3.13 scripts/migration/checks/ac3_parity.py --base <bm/r1 sha> --report <run1.tsv> \
      [--expected scripts/migration/checks/data/mdx-tokens-e7743c4.tsv] [--head HEAD]

  (a)  tokens per kind + files, from the run-1 report (and byte-compare with --expected when given)
  (b)  oracle: every non-label row has new == urlmap(old) (BM-03 urlmap, landing mode i; root-relative → path,
       ink-absolute → absolute); every label row is "ink.dopelab.studio" → "dopelab.studio/blog" right before an
       ink_url row on the same line
  replay: git show <base>:<file> bytes + the row edits (by line, UTF-8 byte col, applied right to left) == <head>:<file>
  completeness: git diff --name-only <base>..<head> -- content/ == the files in the report
  (c)  leftovers over content/posts/**/*.mdx in the work tree, fences and frontmatter included (Python re cross-check
       of the rg --pcre2 commands): each of the 7 patterns must count 0
Writes a NEW ac3-parity-<HHMMSS>.txt under $EVIDENCE_DIR. Exit 0 = every check passes.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

LEFTOVERS = [
    r"\]\(/th/blog/",
    r"\]\(/en/blog/",
    r"\]\(/th/",
    r"\]\(/en/",
    r"!\[[^\]]*\]\(/(?!blog/)",
    r'(src|href|poster)="/(?!blog/)',
    r"ink\.dopelab\.studio",
]


def git(*args: str, binary: bool = False):
    r = subprocess.run(["git", "-C", str(C.REPO), *args], capture_output=True, check=True)
    return r.stdout if binary else r.stdout.decode("utf-8")


def oracle(old: str) -> str:
    m = C.urlmap()
    if old.startswith("http"):
        return m.map_url(old, C.rules(), "i")
    return C.path_of(m.map_url(old, C.rules(), "i"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True)
    ap.add_argument("--head", default="HEAD")
    ap.add_argument("--report", required=True, type=Path)
    ap.add_argument("--expected", type=Path)
    a = ap.parse_args()

    out: list[str] = C.header("ac3_parity.py (AC3)") + [f"# base {a.base} · head {a.head} ({git('rev-parse', a.head).strip()}) · report {a.report}"]
    ok = True
    raw = a.report.read_bytes()
    lines = raw.decode("utf-8").rstrip("\n").split("\n")
    cols = lines[0].split("\t")
    if cols != ["file", "line", "col_utf8_byte", "kind", "old", "new"]:
        print(f"bad report header: {cols}")
        return 2
    rows = []
    for ln in lines[1:]:
        f, n, c, k, o, w = ln.split("\t")
        rows.append((f, int(n), int(c), k, o, w))

    # (a)
    kinds = Counter(r[3] for r in rows)
    files = sorted({r[0] for r in rows})
    out.append("(a) rows " + str(len(rows)) + " · " + " · ".join(f"{k} {kinds.get(k, 0)}" for k in
               ("md_img", "md_link", "ink_url", "jsx_attr", "ink_url_bare", "label")) + f" · files {len(files)}")
    if a.expected:
        same = raw == a.expected.read_bytes()
        out.append(f"(a) report == {a.expected} byte for byte: {'yes' if same else 'NO'}")
        ok &= same

    # (b) oracle
    mism = []
    by_line = defaultdict(list)
    for r in rows:
        by_line[(r[0], r[1])].append(r)
    nlabel_ok = 0
    for f, n, c, k, o, w in rows:
        if k == "label":
            follows = any(x[3] == "ink_url" and x[2] > c for x in by_line[(f, n)])
            if o == "ink.dopelab.studio" and w == "dopelab.studio/blog" and follows:
                nlabel_ok += 1
            else:
                mism.append(f"{f}:{n}:{c} label {o!r} → {w!r} (ink_url after it on the line: {follows})")
            continue
        exp = oracle(o)
        if exp != w:
            mism.append(f"{f}:{n}:{c} {k} {o} → script {w} · urlmap {exp}")
    out.append(f"(b) parity: {len(rows) - kinds.get('label', 0)} URL rows vs urlmap(i) + {kinds.get('label', 0)} labels → mismatches {len(mism)}")
    out.extend("    MISMATCH " + m for m in mism[:50])
    ok &= not mism

    # replay
    bad_replay = []
    for f in files:
        base = git("show", f"{a.base}:{f}", binary=True).split(b"\n")
        for n, edits in sorted(((n, [r for r in rows if r[0] == f and r[1] == n]) for n in {r[1] for r in rows if r[0] == f})):
            line = base[n - 1]
            for _f, _n, c, _k, o, w in sorted(edits, key=lambda r: r[2], reverse=True):
                ob = o.encode("utf-8")
                if line[c:c + len(ob)] != ob:
                    bad_replay.append(f"{f}:{n}:{c} old bytes not found at col")
                    break
                line = line[:c] + w.encode("utf-8") + line[c + len(ob):]
            base[n - 1] = line
        head = git("show", f"{a.head}:{f}", binary=True)
        if b"\n".join(base) != head:
            bad_replay.append(f"{f}: replay != {a.head}")
    out.append(f"replay: {len(files)} files · {'OK' if not bad_replay else 'FAIL ' + str(len(bad_replay))}")
    out.extend("    " + b for b in bad_replay[:50])
    ok &= not bad_replay

    # completeness
    changed = sorted(x for x in git("diff", "--name-only", f"{a.base}..{a.head}", "--", "content/").split("\n") if x)
    extra = sorted(set(changed) - set(files))
    missing = sorted(set(files) - set(changed))
    out.append(f"completeness: git diff {a.base[:7]}..{a.head} -- content/ → {len(changed)} files · report {len(files)} files · "
               f"{'OK' if not extra and not missing else 'FAIL'} (changed but not reported {len(extra)} · reported but unchanged {len(missing)})")
    out.extend(f"    changed-not-reported {x}" for x in extra[:20])
    out.extend(f"    reported-not-changed {x}" for x in missing[:20])
    ok &= not extra and not missing

    # (c) leftovers (work tree)
    posts = sorted((C.REPO / "content" / "posts").rglob("*.mdx"))
    texts = [p.read_text(encoding="utf-8") for p in posts]
    for pat in LEFTOVERS:
        rx = re.compile(pat)
        cnt = sum(len(rx.findall(t)) for t in texts)
        hits = [str(p.relative_to(C.REPO)) for p, t in zip(posts, texts) if rx.search(t)][:3]
        out.append(f"(c) leftover {pat!r}: {cnt}" + (f"  e.g. {hits}" if cnt else ""))
        ok &= cnt == 0
    out.append(f"(c) scanned {len(posts)} .mdx files under content/posts (fences + frontmatter included)")
    out.append("RESULT " + ("PASS" if ok else "FAIL"))

    p = C.evidence_path("ac3-parity", "txt")
    p.write_text("\n".join(out) + "\n", encoding="utf-8")
    print("\n".join(out))
    print(f"evidence {p}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
