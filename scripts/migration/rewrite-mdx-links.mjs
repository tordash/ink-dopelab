#!/usr/bin/env node
// BM-04 MDX link rewrite for the /blog move (SPEC §5.9, REQ §6 / AC3). Node stdlib only, run from the repo root.
//
//   node scripts/migration/rewrite-mdx-links.mjs [--root content/posts] [--dry-run | --check] [--report <file.tsv>]
//   node scripts/migration/rewrite-mdx-links.mjs --fixture <in.mdx> --expect <expected.mdx>
//
//   (default)   rewrite in place — all-or-nothing: every edit is computed first, files are written only with 0 errors
//   --dry-run   write nothing; print the report rows + summary
//   --check     write nothing; exit 1 when any rewrite is pending (lint mode for BM-06/BM-14)
//   --report    also write the TSV report: file line col_utf8_byte kind old new (sorted by file, line, col)
//   --fixture   process one file in memory; exit 0 when the output is byte-equal to --expect
// Exit: 0 ok · 1 unhandled token (an ink.dopelab.studio mention it cannot place / malformed) or pending in --check · 2 usage/IO.
//
// Token definitions are the same as stories/BM-04/data/gen_spec_data.py (the expected-output generator):
//   md_img / md_link  ![alt](DEST "title"?) / [text](DEST) with a root-relative DEST not already under /blog
//   jsx_attr          src= / href= / poster= "…" or '…' with such a value
//   ink_url           a DEST or JSX value that is https?://ink.dopelab.studio[/?#…]
//   ink_url_bare      an ink-absolute URL anywhere else in body text
//   label             link text exactly "ink.dopelab.studio" whose DEST is ink-absolute → "dopelab.studio/blog"
// Never touched: frontmatter, fenced code (``` / ~~~, ≤ 3 spaces indent, closed by the same char with ≥ length),
// inline code spans, external URLs, #anchors, //host URLs, and values already under /blog (so run 2 is a no-op).
//
// The mapping is narrow and self-contained on purpose: BM-03 urlmap (url-rules.json) is the independent oracle
// that checks it (scripts/migration/checks/ac3_parity.py), so AC3 parity is not urlmap compared with itself.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// url-rules.json X-LEG.* (== the 6 legacy-slug redirects BM-04 deletes from next.config.ts): /th/blog/<old> → /blog/<new>
const LEGACY_TH = {
  "google-lyria-3-pro-ai-music": "lyria-3-pro-ai-music-generation",
  "xiaomi-hunter-alpha-ai-ecosystem": "xiaomi-hunter-alpha-600-million-ai-devices",
  "human-made-anti-ai-movement": "human-made-label-ai-backlash-premium",
  "true-corp-nvidia-gtc-2026-thailand-ai": "true-corp-nvidia-gtc-thailand-ai-infrastructure",
  "anthropic-ipo-trillion-dollar-ai": "anthropic-ipo-350b",
  "ai-catches-competitor-price-cheating": "ai-competitor-price-monitor",
};
const NEW_ORIGIN = "https://dopelab.studio";
const OLD_HOST = "ink.dopelab.studio";
const NEW_LABEL = "dopelab.studio/blog";

const FENCE = /^\s{0,3}(`{3,}|~{3,})/u;
const MD_DEST = /(!?)\[((?:[^\[\]\\]|\\.)*)\]\((<?)([^)\s>]+)(>?)((?:\s+"[^"]*")?)\)/gsu;
// Python's str \b before "src" = the previous char is not \w (Unicode letters/digits/_), so no ASCII-only \b here
const JSX = /(?<![\p{L}\p{N}_])(src|href|poster)=("|')([^"']*)\2/gu;
const INK_ABS = /https?:\/\/ink\.dopelab\.studio(?:[/?#][^\s)"'<>\]]*)?/gu;
const INK_ABS_FULL = /^https?:\/\/ink\.dopelab\.studio(?:[/?#][^\s)"'<>\]]*)?$/u;

const isRootRel = (v) => v.startsWith("/") && !v.startsWith("//");
const underBlog = (v) => v === "/blog" || v.startsWith("/blog/") || v.startsWith("/blog?") || v.startsWith("/blog#");
const bytesBefore = (line, i) => Buffer.byteLength(line.slice(0, i), "utf8");

function mapPath(p) {
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1); // one trailing slash (R-TRAIL)
  const leg = /^\/th\/blog\/([^/]+)$/.exec(p);
  if (leg && Object.hasOwn(LEGACY_TH, leg[1])) return `/blog/${LEGACY_TH[leg[1]]}`;
  if (p === "/th") return "/blog";
  if (p === "/en") return "/blog/en";
  if (p === "/th/blog") return "/blog/all";
  if (p === "/en/blog") return "/blog/en/all";
  if (p.startsWith("/th/blog/")) return `/blog/${p.slice("/th/blog/".length)}`;
  if (p.startsWith("/en/blog/")) return `/blog/en/${p.slice("/en/blog/".length)}`;
  if (p.startsWith("/th/")) return `/blog/${p.slice("/th/".length)}`;
  if (p.startsWith("/en/")) return `/blog/en/${p.slice("/en/".length)}`;
  if (p === "/") return "/blog";
  return `/blog${p}`;
}

/** Root-relative → root-relative · ink-absolute → https://dopelab.studio/blog… · never decodes or encodes. */
function mapValue(v) {
  let rest = v;
  let frag = "";
  let query = "";
  const h = rest.indexOf("#");
  if (h !== -1) [rest, frag] = [rest.slice(0, h), rest.slice(h)];
  const abs = /^https?:\/\//.test(rest);
  if (abs) rest = rest.replace(/^https?:\/\/ink\.dopelab\.studio/, "");
  const q = rest.indexOf("?");
  if (q !== -1) [rest, query] = [rest.slice(0, q), rest.slice(q)];
  const out = mapPath(rest || "/") + query + frag;
  return abs ? NEW_ORIGIN + out : out;
}

function codeSpans(line) {
  const spans = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === "`") {
      let j = i;
      while (j < line.length && line[j] === "`") j += 1;
      const run = line.slice(i, j);
      const k = line.indexOf(run, j);
      if (k === -1) {
        i = j;
        continue;
      }
      spans.push([i, k + run.length]);
      i = k + run.length;
    } else i += 1;
  }
  return spans;
}
const inSpans = (pos, spans) => spans.some(([a, b]) => a <= pos && pos < b);

/** Rewrite one file's text. Returns { out, rows, errors } — rows = [line, col_utf8_byte, kind, old, new]. */
function rewriteText(text) {
  const lines = text.split("\n");
  const rows = [];
  const errors = [];
  let front = lines.length > 0 && lines[0].trim() === "---";
  let fence = null;
  const outLines = lines.map((line, idx) => {
    const n = idx + 1;
    if (front) {
      if (n > 1 && line.trim() === "---") front = false;
      return line;
    }
    const fm = FENCE.exec(line);
    if (fence) {
      if (fm && fm[1][0] === fence[0] && fm[1].length >= fence.length) fence = null;
      return line;
    }
    if (fm) {
      fence = fm[1];
      return line;
    }
    const spans = codeSpans(line);
    const taken = new Set();
    const edits = []; // [start, end, new, kind, old]
    for (const m of line.matchAll(MD_DEST)) {
      const v = m[4];
      const col = m.index + m[1].length + 1 + m[2].length + 2 + m[3].length; // start of group 4
      if (inSpans(col, spans)) continue;
      let kind;
      if (INK_ABS_FULL.test(v)) kind = "ink_url";
      else if (isRootRel(v) && !underBlog(v)) kind = m[1] === "!" ? "md_img" : "md_link";
      else continue;
      edits.push([col, col + v.length, mapValue(v), kind, v]);
      taken.add(col);
      if (m[1] === "" && m[2] === OLD_HOST && kind === "ink_url") {
        const lc = m.index + 1; // start of group 2 (after "[")
        edits.push([lc, lc + OLD_HOST.length, NEW_LABEL, "label", OLD_HOST]);
      }
    }
    for (const m of line.matchAll(JSX)) {
      const v = m[3];
      const col = m.index + m[1].length + 2; // after `attr=` and the quote
      if (inSpans(col, spans) || taken.has(col)) continue;
      let kind;
      if (INK_ABS_FULL.test(v)) kind = "ink_url";
      else if (isRootRel(v) && !underBlog(v)) kind = "jsx_attr";
      else continue;
      edits.push([col, col + v.length, mapValue(v), kind, v]);
      taken.add(col);
    }
    for (const m of line.matchAll(INK_ABS)) {
      if (taken.has(m.index) || inSpans(m.index, spans)) continue;
      edits.push([m.index, m.index + m[0].length, mapValue(m[0]), "ink_url_bare", m[0]]);
      taken.add(m.index);
    }
    // every ink.dopelab.studio left in body text (outside inline code) must sit inside an edit: otherwise we cannot place it
    for (let i = line.indexOf(OLD_HOST); i !== -1; i = line.indexOf(OLD_HOST, i + 1)) {
      if (inSpans(i, spans)) continue;
      if (!edits.some(([a, b]) => a <= i && i + OLD_HOST.length <= b)) {
        errors.push(`${n}:${bytesBefore(line, i)} unplaced "${OLD_HOST}" mention: ${line.trim().slice(0, 160)}`);
      }
    }
    edits.sort((x, y) => x[0] - y[0]);
    for (let k = 1; k < edits.length; k += 1) {
      if (edits[k][0] < edits[k - 1][1]) errors.push(`${n}:${bytesBefore(line, edits[k][0])} overlapping tokens`);
    }
    for (const [s, , nw, kind, old] of edits) rows.push([n, bytesBefore(line, s), kind, old, nw]);
    let out = line;
    for (const [s, e, nw] of [...edits].reverse()) out = out.slice(0, s) + nw + out.slice(e);
    return out;
  });
  return { out: outLines.join("\n"), rows, errors };
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && e.name.endsWith(".mdx")) out.push(p);
  }
  return out;
}

function usage(msg) {
  console.error(`rewrite-mdx-links: ${msg}`);
  console.error("usage: rewrite-mdx-links.mjs [--root content/posts] [--dry-run | --check] [--report <file.tsv>]");
  console.error("       rewrite-mdx-links.mjs --fixture <in.mdx> --expect <expected.mdx>");
  process.exit(2);
}

function readUtf8(p) {
  const buf = readFileSync(p);
  const text = buf.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(buf)) throw new Error(`${p}: not valid UTF-8 (would not round-trip)`);
  return text;
}

function main(argv) {
  const a = { root: "content/posts", mode: "write", report: null, fixture: null, expect: null };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    const val = () => (i + 1 < argv.length ? argv[++i] : usage(`${k} needs a value`));
    if (k === "--root") a.root = val();
    else if (k === "--dry-run") a.mode = a.mode === "write" ? "dry-run" : usage("--dry-run and --check are exclusive");
    else if (k === "--check") a.mode = a.mode === "write" ? "check" : usage("--dry-run and --check are exclusive");
    else if (k === "--report") a.report = val();
    else if (k === "--fixture") a.fixture = val();
    else if (k === "--expect") a.expect = val();
    else usage(`unknown argument ${k}`);
  }

  if (a.fixture || a.expect) {
    if (!a.fixture || !a.expect) usage("--fixture and --expect go together");
    let src, exp;
    try {
      src = readUtf8(a.fixture);
      exp = readFileSync(a.expect);
    } catch (e) {
      usage(e.message);
    }
    const { out, rows, errors } = rewriteText(src);
    for (const r of rows) console.log(["fixture", ...r].join("\t"));
    for (const e of errors) console.log(`ERROR ${a.fixture}:${e}`);
    const equal = Buffer.from(out, "utf8").equals(exp);
    console.log(`FIXTURE ${a.fixture} → ${rows.length} edits · errors ${errors.length} · ${equal ? "byte-equal to" : "DIFFERS from"} ${a.expect}`);
    return errors.length === 0 && equal ? 0 : 1;
  }

  let files;
  try {
    if (!statSync(a.root).isDirectory()) usage(`--root ${a.root} is not a directory`);
    files = walk(a.root).map((f) => relative(process.cwd(), f).split(sep).join("/")).sort();
  } catch (e) {
    usage(`cannot read --root ${a.root}: ${e.message}`);
  }

  const all = [];
  const errors = [];
  const writes = [];
  for (const f of files) {
    let text;
    try {
      text = readUtf8(f);
    } catch (e) {
      usage(e.message);
    }
    const r = rewriteText(text);
    for (const e of r.errors) errors.push(`${f}:${e}`);
    for (const row of r.rows) all.push([f, ...row]);
    if (r.out !== text) writes.push([f, r.out]);
  }
  all.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1] || x[2] - y[2]));

  const count = (k) => all.filter((r) => r[3] === k).length;
  const changedFiles = new Set(all.map((r) => r[0])).size;
  const summary =
    `REWRITE files ${changedFiles} · md_img ${count("md_img")} · md_link ${count("md_link")} · ink_url ${count("ink_url")} · ` +
    `jsx_attr ${count("jsx_attr")} · ink_url_bare ${count("ink_url_bare")} · labels ${count("label")} · errors ${errors.length} · ` +
    `RESULT ${errors.length ? "ERROR" : "OK"}`;

  if (a.report) {
    try {
      writeFileSync(a.report, ["file\tline\tcol_utf8_byte\tkind\told\tnew", ...all.map((r) => r.join("\t"))].join("\n") + "\n");
    } catch (e) {
      usage(`cannot write --report ${a.report}: ${e.message}`);
    }
  }
  if (a.mode === "dry-run") for (const r of all) console.log(r.join("\t"));
  for (const e of errors) console.log(`ERROR ${e}`);

  let wrote = 0;
  if (a.mode === "write" && errors.length === 0) {
    for (const [f, out] of writes) {
      try {
        writeFileSync(f, out);
        wrote += 1;
      } catch (e) {
        console.error(`rewrite-mdx-links: write failed for ${f} after ${wrote} file(s): ${e.message}`);
        process.exit(2);
      }
    }
  }
  console.log(summary);
  const verb = a.mode === "write" ? (errors.length ? "nothing written (errors)" : `wrote ${wrote} file(s)`) : `${a.mode}: nothing written`;
  console.log(`changes ${all.length} (tokens + labels) in ${writes.length} file(s) · scanned ${files.length} · ${verb}`);
  if (errors.length) return 1;
  if (a.mode === "check" && all.length) {
    console.log(`PENDING ${all.length} rewrite(s) — run without --check to apply`);
    return 1;
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
