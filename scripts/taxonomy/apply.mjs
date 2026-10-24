#!/usr/bin/env node
// BM-18 taxonomy apply / revert (tordash/dopelab-oracle#27 · SPEC S6, §6.2 · REQ AC3).
// Node stdlib only · never deletes a file · body bytes are frozen.
//
//   node scripts/taxonomy/apply.mjs --map <dopelab data/taxonomy-map-v1.json> [--root DIR] [--ledger FILE]
//   node scripts/taxonomy/apply.mjs --revert --ledger FILE [--root DIR]
//
// apply: in every content/posts/{th,en}/**/*.mdx rewrite exactly the `category: "<x>"` line and the inline
// `tags: [ … ]` line of the frontmatter to taxonomy keys:
//   value = map.overrides["<loc>/<slug>"] (category and/or tags), else map.categories[old] and, for tags, every raw
//   tag → map.tags[raw] (null = retire) in the post's order, de-duplicated, capped at map.max_tags.
//   A value that is already a key counts as `already` (idempotent). 0 resulting tags → exit 1 (needs an override).
// All-or-nothing: every file is checked first (exactly one category line and one inline tags line, every raw value
// known, body bytes unchanged); any problem → exit 1 and NOTHING is written. The ledger
// {"<path>": {"category": "<old line>", "tags": "<old line>"}} is written only for files that change, never
// overwriting an entry already in it, so a rerun keeps the first apply's old lines.
// revert: puts the ledger's old lines back (works even after BM-16 Phase B edited the neighbouring draft: line).
// Output: applied n · already n · overrides n · capped n · body-diff 0   |   reverted n
// Exit 0 ok · 1 data error (nothing written) · 2 usage / IO error.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const CATEGORY_LINE = /^category: "(.*)"$/;
const TAGS_LINE = /^tags: \[(.*)\]$/;

class UsageError extends Error {}
class DataError extends Error {}

function args(argv) {
  const a = { root: process.cwd(), map: null, ledger: null, revert: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--root") a.root = resolve(argv[++i] ?? "");
    else if (k === "--map") a.map = resolve(argv[++i] ?? "");
    else if (k === "--ledger") a.ledger = resolve(argv[++i] ?? "");
    else if (k === "--revert") a.revert = true;
    else throw new UsageError(`unknown argument ${k}`);
  }
  if (a.revert ? !a.ledger : !a.map) throw new UsageError("usage: apply.mjs --map MAP [--root DIR] [--ledger FILE] | --revert --ledger FILE [--root DIR]");
  return a;
}

function walkMdx(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkMdx(p));
    else if (name.endsWith(".mdx")) out.push(p);
  }
  return out;
}

function posts(root) {
  const out = [];
  for (const loc of ["th", "en"]) {
    const d = join(root, "content", "posts", loc);
    if (!existsSync(d)) continue;
    for (const f of walkMdx(d)) {
      const rel = relative(root, f).split(sep).join("/");
      const slug = rel.slice(`content/posts/${loc}/`.length).replace(/\.mdx$/, "");
      out.push({ loc, slug, path: f, rel });
    }
  }
  return out;
}

/** {lines, end, catIdx, tagIdx} of the frontmatter (line 1 `---` .. next `---`), or a DataError. */
function locate(text, rel) {
  const lines = text.split("\n");
  if (lines[0] !== "---") throw new DataError(`${rel}: no frontmatter`);
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new DataError(`${rel}: frontmatter not closed`);
  const cat = [];
  const tag = [];
  for (let i = 1; i < end; i++) {
    if (lines[i].startsWith("category:")) cat.push(i);
    if (/^tags:/.test(lines[i])) tag.push(i);
  }
  if (cat.length !== 1 || !CATEGORY_LINE.test(lines[cat[0]])) throw new DataError(`${rel}: needs exactly one line category: "<x>" (found ${cat.length})`);
  if (tag.length !== 1 || !TAGS_LINE.test(lines[tag[0]])) throw new DataError(`${rel}: needs exactly one inline line tags: [ … ] (found ${tag.length}${tag.length === 1 ? ", not inline" : ""})`);
  return { lines, end, catIdx: cat[0], tagIdx: tag[0] };
}

const bodyOf = (lines, end) => lines.slice(end + 1).join("\n");
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function newValues(map, keys, post, oldCat, oldTags) {
  const ov = own(map.overrides || {}, `${post.loc}/${post.slug}`) ? map.overrides[`${post.loc}/${post.slug}`] : {};
  let cat;
  if (own(map.categories, oldCat)) cat = map.categories[oldCat];
  else if (keys.categories.has(oldCat)) cat = oldCat;
  else throw new DataError(`${post.rel}: category ${JSON.stringify(oldCat)} is not in the taxonomy map`);
  const out = [];
  for (const t of oldTags) {
    let k;
    if (own(map.tags, t)) k = map.tags[t];
    else if (keys.tags.has(t)) k = t;
    else throw new DataError(`${post.rel}: tag ${JSON.stringify(t)} is not in the taxonomy map`);
    if (k !== null && !out.includes(k)) out.push(k);
  }
  let capped = out.length > map.max_tags;
  let tags = out.slice(0, map.max_tags);
  if (ov.category != null) cat = ov.category;
  if (ov.tags != null) {
    tags = [...ov.tags];
    capped = false;
  }
  if (!tags.length) throw new DataError(`${post.rel}: 0 tags after mapping (needs an override)`);
  return { cat, tags, capped, override: ov.category != null || ov.tags != null };
}

function doApply(a) {
  let map;
  try {
    map = JSON.parse(readFileSync(a.map, "utf8"));
  } catch (e) {
    throw new UsageError(`cannot read --map ${a.map}: ${e.message}`);
  }
  for (const k of ["categories", "tags", "max_tags", "category_order"]) if (!own(map, k)) throw new UsageError(`--map ${a.map}: no "${k}"`);
  const keys = { categories: new Set(map.category_order), tags: new Set(Object.values(map.tags).filter((v) => v !== null)) };
  for (const ov of Object.values(map.overrides || {})) for (const t of ov.tags || []) keys.tags.add(t);
  const list = posts(a.root);
  if (!list.length) throw new UsageError(`no posts under ${join(a.root, "content", "posts")}/{th,en}`);
  const plan = [];
  const errors = [];
  let already = 0;
  let overrides = 0;
  let capped = 0;
  for (const p of list) {
    try {
      const text = readFileSync(p.path, "utf8");
      const loc = locate(text, p.rel);
      const oldCatLine = loc.lines[loc.catIdx];
      const oldTagLine = loc.lines[loc.tagIdx];
      const oldCat = CATEGORY_LINE.exec(oldCatLine)[1];
      let oldTags;
      try {
        oldTags = JSON.parse(`[${TAGS_LINE.exec(oldTagLine)[1]}]`);
      } catch {
        throw new DataError(`${p.rel}: tags line is not a JSON-compatible list`);
      }
      if (!oldTags.every((t) => typeof t === "string")) throw new DataError(`${p.rel}: tags must be strings`);
      const v = newValues(map, keys, p, oldCat, oldTags);
      const catLine = `category: ${JSON.stringify(v.cat)}`;
      const tagLine = `tags: [${v.tags.map((t) => JSON.stringify(t)).join(", ")}]`;
      if (catLine === oldCatLine && tagLine === oldTagLine) {
        already++;
        continue;
      }
      const lines = [...loc.lines];
      lines[loc.catIdx] = catLine;
      lines[loc.tagIdx] = tagLine;
      const next = lines.join("\n");
      if (bodyOf(lines, loc.end) !== bodyOf(loc.lines, loc.end)) throw new DataError(`${p.rel}: body bytes would change`);
      overrides += v.override ? 1 : 0;
      capped += v.capped ? 1 : 0;
      plan.push({ p, next, oldCatLine, oldTagLine });
    } catch (e) {
      if (!(e instanceof DataError)) throw e;
      errors.push(e.message);
    }
  }
  if (errors.length) {
    for (const e of errors) console.error(`TAXONOMY APPLY FAIL ${e}`);
    console.error(`RESULT FAIL exit 1 · nothing written (${errors.length} file(s))`);
    return 1;
  }
  let ledger = {};
  if (a.ledger && existsSync(a.ledger)) {
    try {
      ledger = JSON.parse(readFileSync(a.ledger, "utf8"));
    } catch (e) {
      throw new UsageError(`cannot read --ledger ${a.ledger}: ${e.message}`);
    }
  }
  for (const x of plan) writeFileSync(x.p.path, x.next);
  if (a.ledger && plan.length) {
    for (const x of plan) if (!own(ledger, x.p.rel)) ledger[x.p.rel] = { category: x.oldCatLine, tags: x.oldTagLine };
    const sorted = Object.fromEntries(Object.keys(ledger).sort().map((k) => [k, ledger[k]]));
    writeFileSync(a.ledger, JSON.stringify(sorted, null, 2) + "\n");
  }
  console.log(`applied ${plan.length} · already ${already} · overrides ${overrides} · capped ${capped} · body-diff 0`);
  return 0;
}

function doRevert(a) {
  let ledger;
  try {
    ledger = JSON.parse(readFileSync(a.ledger, "utf8"));
  } catch (e) {
    throw new UsageError(`cannot read --ledger ${a.ledger}: ${e.message}`);
  }
  const plan = [];
  const errors = [];
  for (const [rel, old] of Object.entries(ledger)) {
    const path = join(a.root, ...rel.split("/"));
    try {
      if (!existsSync(path)) throw new DataError(`${rel}: file is gone`);
      const loc = locate(readFileSync(path, "utf8"), rel);
      if (!CATEGORY_LINE.test(old.category) || !TAGS_LINE.test(old.tags)) throw new DataError(`${rel}: ledger entry is not a category/tags line pair`);
      const lines = [...loc.lines];
      lines[loc.catIdx] = old.category;
      lines[loc.tagIdx] = old.tags;
      if (bodyOf(lines, loc.end) !== bodyOf(loc.lines, loc.end)) throw new DataError(`${rel}: body bytes would change`);
      plan.push([path, lines.join("\n")]);
    } catch (e) {
      if (!(e instanceof DataError)) throw e;
      errors.push(e.message);
    }
  }
  if (errors.length) {
    for (const e of errors) console.error(`TAXONOMY REVERT FAIL ${e}`);
    console.error("RESULT FAIL exit 1 · nothing written");
    return 1;
  }
  for (const [path, text] of plan) writeFileSync(path, text);
  console.log(`reverted ${plan.length}`);
  return 0;
}

try {
  const a = args(process.argv.slice(2));
  process.exitCode = a.revert ? doRevert(a) : doApply(a);
} catch (e) {
  console.error(`taxonomy apply error: ${e.message}`);
  process.exitCode = e instanceof DataError ? 1 : 2;
}
