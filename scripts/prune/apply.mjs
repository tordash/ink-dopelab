#!/usr/bin/env node
// BM-16 · content prune — apply / revert the unpublish marker (tordash/dopelab-oracle#19 · SPEC §9.1, S1).
//
//   node scripts/prune/apply.mjs --list <list.tsv> [--root <repo dir, default cwd>]   # apply
//   node scripts/prune/apply.mjs --revert [--root <dir>]                              # undo everything BM-16 did
//
// Apply: for every `bucket = drop` row of the list TSV (audit schema; only locale, slug, bucket, rule,
// target are read) the frontmatter line `draft: false` becomes `draft: true # bm16-prune was=false`, or,
// when the post has no `draft:` line, `draft: true # bm16-prune was=absent` is added as the last
// frontmatter line. velite already hides drafts from lists, tags, categories, search, sitemap and feed;
// the MDX stays in git. Then src/lib/prune/prune-map.json is written from the drop rows (structured
// targets, never hrefs) for the build-time link rewrite and the /api/gone handler.
// All-or-nothing: every edit is computed first; one error = nothing is written.
// The marked set must equal the drop set: a post that already carries the marker but is not a drop row of
// this list is an error (apply never re-publishes; to apply a smaller list run --revert, then apply).
// Revert: every marker line under content/posts/{th,en}/*.mdx is restored and the map is reset.
//
// Exit: 0 ok · 1 data error (slug missing, unexpected draft line, malformed TSV) · 2 usage/IO.
// Node stdlib only. Never deletes a file.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const EMPTY_MAP = { source: null, posts: {} };
export const MAP_REL = join("src", "lib", "prune", "prune-map.json");
const MARK = "# bm16-prune";
const MARK_FALSE = `draft: true ${MARK} was=false`;
const MARK_ABSENT = `draft: true ${MARK} was=absent`;
const LOCALES = new Set(["th", "en"]);
const SLUG = /^[a-z0-9-]+$/;

class DataError extends Error {}

export function serializeMap(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

/** Parse a strict TSV (header first, no quoting) into row objects. */
export function parseTsv(text) {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (!lines.length) throw new DataError("empty TSV (header required)");
  const head = lines[0].split("\t");
  for (const need of ["locale", "slug", "bucket", "rule", "target"]) {
    if (!head.includes(need)) throw new DataError(`TSV header has no '${need}' column`);
  }
  return lines.slice(1).map((ln, i) => {
    const f = ln.split("\t");
    if (f.length !== head.length) throw new DataError(`TSV line ${i + 2}: ${f.length} fields, expected ${head.length}`);
    return Object.fromEntries(head.map((h, j) => [h, f[j]]));
  });
}

/** Structured target of a list row: R3 -> gone · …/all -> list · …/category/<enc> -> category · else post. */
export function kindOf(rule, target, locale) {
  if (rule === "R3") return { kind: "gone" };
  let path;
  try {
    path = new URL(target).pathname;
  } catch {
    throw new DataError(`target ${JSON.stringify(target)} is not an absolute URL`);
  }
  const segs = path.split("/").filter(Boolean);
  if (segs[0] === "blog") segs.shift();
  if (locale === "en" && segs[0] === "en") segs.shift();
  if (segs.length === 1 && segs[0] === "all") return { kind: "list" };
  if (segs.length === 2 && segs[0] === "category") return { kind: "category", category: decodeURIComponent(segs[1]) };
  if (segs.length === 1 && SLUG.test(segs[0])) return { kind: "post", slug: segs[0] };
  throw new DataError(`target ${target} is not a post, category or list-hub URL for locale ${locale}`);
}

function frontmatter(lines) {
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  return end === -1 ? null : end;
}

/** Plan the edit for one file: {state: "apply"|"already", text} or throw DataError. */
function planApply(text, key) {
  const lines = text.split("\n");
  const end = frontmatter(lines);
  if (end === null) throw new DataError(`${key}: no frontmatter block`);
  const idx = [];
  for (let i = 1; i < end; i++) if (lines[i].startsWith("draft:")) idx.push(i);
  if (idx.length > 1) throw new DataError(`${key}: ${idx.length} draft: lines (expected 0 or 1)`);
  if (idx.length === 0) {
    lines.splice(end, 0, MARK_ABSENT);
    return { state: "apply", text: lines.join("\n") };
  }
  const ln = lines[idx[0]];
  if (ln === MARK_FALSE || ln === MARK_ABSENT) return { state: "already", text };
  if (ln !== "draft: false") throw new DataError(`${key}: unexpected draft line ${JSON.stringify(ln)} (only 'draft: false' or none is prunable)`);
  lines[idx[0]] = MARK_FALSE;
  return { state: "apply", text: lines.join("\n") };
}

/** Every content/posts/{th,en}/*.mdx with a frontmatter block: {key, file, lines, marks} where marks = the
 *  frontmatter line indexes that carry the BM-16 marker. Shared by apply (stale check) and revert. */
function* scanPosts(root) {
  for (const loc of LOCALES) {
    const dir = join(root, "content", "posts", loc);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith(".mdx")) continue;
      const file = join(dir, name);
      const lines = readFileSync(file, "utf8").split("\n");
      const end = frontmatter(lines);
      if (end === null) continue;
      const marks = [];
      for (let i = 1; i < end; i++) if (lines[i] === MARK_FALSE || lines[i] === MARK_ABSENT) marks.push(i);
      yield { key: `${loc}/${name.slice(0, -".mdx".length)}`, file, lines, marks };
    }
  }
}

function writeMap(root, obj) {
  const p = join(root, MAP_REL);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, serializeMap(obj));
}

export function applyList({ root = process.cwd(), listPath }) {
  const out = [];
  try {
    let raw;
    try {
      raw = readFileSync(listPath);
    } catch (e) {
      return { code: 2, lines: [`error: cannot read --list ${listPath}: ${e.message}`] };
    }
    const rows = parseTsv(raw.toString("utf8"));
    const errors = [];
    const plans = [];
    const posts = {};
    const seen = new Set();
    let skipped = 0;
    for (const r of rows) {
      if (r.bucket !== "drop") {
        skipped++;
        continue;
      }
      const key = `${r.locale}/${r.slug}`;
      if (!LOCALES.has(r.locale) || !SLUG.test(r.slug)) {
        errors.push(`${key}: bad locale or slug`);
        continue;
      }
      if (seen.has(key)) {
        errors.push(`${key}: duplicate list row`);
        continue;
      }
      seen.add(key);
      const file = join(root, "content", "posts", r.locale, `${r.slug}.mdx`);
      if (!existsSync(file)) {
        errors.push(`${key}: no content/posts/${key}.mdx`);
        continue;
      }
      try {
        plans.push({ key, file, ...planApply(readFileSync(file, "utf8"), key) });
        posts[key] = { rule: r.rule, ...kindOf(r.rule, r.target, r.locale) };
      } catch (e) {
        if (!(e instanceof DataError)) throw e;
        errors.push(e.message);
      }
    }
    // Review F2 (#19 · REQ §5.1 · AC10): the marked set must equal the drop set. A post hidden by an earlier apply
    // that is not a drop row of this list would stay unpublished with no map entry (no link rewrite, no 410, no rule).
    // Refuse instead of guessing; the way to apply a smaller list is --revert, then apply.
    for (const p of scanPosts(root)) {
      if (p.marks.length && !seen.has(p.key)) {
        errors.push(`${p.key}: hidden by an earlier apply but not a drop row of this list (run --revert, then apply this list)`);
      }
    }
    if (errors.length) {
      for (const e of errors) out.push(`FAIL ${e}`);
      out.push(`RESULT FAIL exit 1 · nothing written (${errors.length} error(s))`);
      return { code: 1, lines: out };
    }
    for (const p of plans) if (p.state === "apply") writeFileSync(p.file, p.text);
    const sorted = Object.fromEntries(Object.keys(posts).sort().map((k) => [k, posts[k]]));
    const sha = createHash("sha256").update(raw).digest("hex").slice(0, 12);
    writeMap(root, { source: `${basename(listPath)} sha256:${sha}`, posts: sorted });
    const applied = plans.filter((p) => p.state === "apply").length;
    out.push(`applied ${applied} · already ${plans.length - applied} · skipped ${skipped} · map ${Object.keys(sorted).length} entries`);
    return { code: 0, lines: out };
  } catch (e) {
    if (e instanceof DataError) return { code: 1, lines: [...out, `FAIL ${e.message}`, "RESULT FAIL exit 1"] };
    return { code: 2, lines: [...out, `error: ${e.message}`] };
  }
}

export function revert({ root = process.cwd() }) {
  let n = 0;
  try {
    for (const { file, lines, marks } of scanPosts(root)) {
      if (!marks.length) continue;
      for (const i of [...marks].reverse()) {
        if (lines[i] === MARK_FALSE) lines[i] = "draft: false";
        else lines.splice(i, 1);
      }
      writeFileSync(file, lines.join("\n"));
      n++;
    }
    writeMap(root, EMPTY_MAP);
    return { code: 0, lines: [`reverted ${n} · map reset`] };
  } catch (e) {
    return { code: 2, lines: [`error: ${e.message}`] };
  }
}

function main(argv) {
  const args = { list: null, root: process.cwd(), revert: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") args.list = argv[++i];
    else if (a === "--root") args.root = argv[++i];
    else if (a === "--revert") args.revert = true;
    else {
      console.error(`unknown argument ${a}`);
      return 2;
    }
  }
  if (args.revert === Boolean(args.list) || (args.list === undefined) || (args.root === undefined)) {
    console.error("usage: apply.mjs --list <tsv> [--root <dir>]  |  apply.mjs --revert [--root <dir>]");
    return 2;
  }
  const res = args.revert ? revert({ root: resolve(args.root) }) : applyList({ root: resolve(args.root), listPath: args.list });
  for (const ln of res.lines) (res.code === 2 ? console.error : console.log)(ln);
  return res.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
