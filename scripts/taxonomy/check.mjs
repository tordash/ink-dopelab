#!/usr/bin/env node
// BM-18 taxonomy build guard (tordash/dopelab-oracle#27 · SPEC S7, §5.1 · REQ D8, AC1, AC4).
// Chained in `npm run build` after the reserved-slug guard and before velite.
// Node stdlib only (no TS import: the build Node may not strip types) · reads no env · never writes.
//
// Every content/posts/{th,en}/**/*.mdx — drafts included — must have exactly one `category: "<key>"` line and one
// inline `tags: ["k1", …]` line in its frontmatter; the category is a key of src/lib/taxonomy/taxonomy.json, the
// tags are 1–5 distinct tag keys. taxonomy.json itself must pass the AC1 rules (the same rules as
// src/lib/taxonomy/model.ts validateTaxonomy; tests/check.test.mjs asserts both copies agree).
//   taxonomy OK · posts n · categories 6 (visible th a · en b) · tags 34
//   TAXONOMY FAIL <path> <field> "<value>"   (one line per violation, all reported first)
// Exit 0 ok · 1 any violation · 2 tool error (missing/invalid input).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TAXONOMY = resolve(HERE, "..", "..", "src", "lib", "taxonomy", "taxonomy.json");
export const KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_TAGS = 5;
const CATEGORY_RANGE = [5, 7];
const TAG_RANGE = [20, 60];
const AI_SHARE_MAX = 0.2;
const CATEGORY_LINE = /^category: "(.*)"$/;
const TAGS_LINE = /^tags: \[(.*)\]$/;

class ToolError extends Error {}

const blank = (s) => typeof s !== "string" || s.trim() === "";

/** AC1 rules — keep identical to src/lib/taxonomy/model.ts validateTaxonomy (asserted by check.test.mjs). */
export function validateTaxonomy(t) {
  const errs = [];
  const cats = Array.isArray(t?.categories) ? t.categories : [];
  const tags = Array.isArray(t?.tags) ? t.tags : [];
  if (cats.length < CATEGORY_RANGE[0] || cats.length > CATEGORY_RANGE[1]) {
    errs.push(`categories ${cats.length} outside ${CATEGORY_RANGE[0]}–${CATEGORY_RANGE[1]}`);
  }
  const seen = new Map();
  for (const [kind, list] of [["category", cats], ["tag", tags]]) {
    for (const item of list) {
      if (typeof item?.key !== "string" || !KEY_RE.test(item.key)) errs.push(`${kind} key ${JSON.stringify(item?.key)} does not match ${KEY_RE}`);
      const k = String(item?.key ?? "");
      const folded = `${kind}:${k.toLowerCase()}`;
      if (seen.has(folded)) errs.push(seen.get(folded) === k ? `duplicate ${kind} key ${k}` : `casefold duplicate ${kind} key ${k} / ${seen.get(folded)}`);
      else seen.set(folded, k);
      for (const loc of ["th", "en"]) if (blank(item?.names?.[loc])) errs.push(`${kind} ${k}: empty ${loc} name`);
    }
  }
  for (const c of cats) {
    for (const loc of ["th", "en"]) if (blank(c?.description?.[loc])) errs.push(`category ${c.key}: empty ${loc} description`);
    if (blank(c?.role)) errs.push(`category ${c.key}: empty role`);
    if (typeof c?.ai_topic !== "boolean") errs.push(`category ${c.key}: ai_topic must be true|false`);
    if (c?.min_posts !== undefined && !(Number.isInteger(c.min_posts) && c.min_posts >= 1)) errs.push(`category ${c.key}: min_posts must be an integer ≥ 1`);
  }
  const ai = cats.filter((c) => c?.ai_topic === true);
  if (ai.length !== 1) errs.push(`ai_topic keys ${ai.length}: exactly 1 required`);
  if (cats.length && ai.length / cats.length > AI_SHARE_MAX) errs.push(`ai_topic share ${Math.round((ai.length / cats.length) * 100)}% > 20%`);
  const keys = new Set(cats.map((c) => c?.key));
  for (const role of ["shop", "how-to"]) if (!keys.has(role)) errs.push(`roles: a ${role} category is required`);
  if (tags.length < TAG_RANGE[0] || tags.length > TAG_RANGE[1]) errs.push(`tags ${tags.length} outside ${TAG_RANGE[0]}–${TAG_RANGE[1]}`);
  return errs;
}

/** Frontmatter lines of an MDX text (between the first two `---` lines), or null. */
export function frontmatter(text) {
  const lines = text.split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  return end < 0 ? null : lines.slice(1, end);
}

/** Violations of one post: [{field, value}]. Also returns the parsed category / tags / draft. */
export function checkPost(text, catKeys, tagKeys) {
  const fails = [];
  const fm = frontmatter(text);
  if (!fm) return { fails: [{ field: "frontmatter", value: "missing" }] };
  const catLines = fm.filter((l) => l.startsWith("category:"));
  const tagLines = fm.filter((l) => /^tags:/.test(l));
  let category = null;
  let tags = null;
  if (catLines.length !== 1) fails.push({ field: "category", value: catLines.length ? `${catLines.length} category lines` : "missing" });
  else {
    const m = CATEGORY_LINE.exec(catLines[0]);
    if (!m) fails.push({ field: "category", value: catLines[0].slice("category:".length).trim() });
    else if (!catKeys.has(m[1])) fails.push({ field: "category", value: m[1] });
    else category = m[1];
  }
  if (tagLines.length !== 1) fails.push({ field: "tags", value: tagLines.length ? `${tagLines.length} tags lines` : "missing" });
  else {
    const m = TAGS_LINE.exec(tagLines[0]);
    let parsed = null;
    if (m) {
      try {
        parsed = JSON.parse(`[${m[1]}]`);
      } catch {
        parsed = null;
      }
    }
    if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== "string")) {
      fails.push({ field: "tags", value: tagLines[0].slice("tags:".length).trim() || "not an inline [..] list" });
    } else {
      for (const x of parsed) if (!tagKeys.has(x)) fails.push({ field: "tags", value: x });
      const dup = parsed.find((x, i) => parsed.indexOf(x) !== i);
      if (dup !== undefined) fails.push({ field: "tags", value: `duplicate ${dup}` });
      if (parsed.length === 0) fails.push({ field: "tags", value: "0 tags" });
      if (parsed.length > MAX_TAGS) fails.push({ field: "tags", value: `${parsed.length} tags (max ${MAX_TAGS})` });
      tags = parsed;
    }
  }
  const draft = fm.some((l) => /^draft:\s*true\s*$/.test(l));
  return { fails, category, tags, draft };
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

export function checkTree(root, taxonomyPath = DEFAULT_TAXONOMY) {
  if (!existsSync(taxonomyPath)) throw new ToolError(`no taxonomy file at ${taxonomyPath}`);
  let t;
  try {
    t = JSON.parse(readFileSync(taxonomyPath, "utf8"));
  } catch (e) {
    throw new ToolError(`cannot parse ${taxonomyPath}: ${e.message}`);
  }
  const lines = [];
  for (const e of validateTaxonomy(t)) lines.push(`TAXONOMY FAIL ${relative(root, taxonomyPath) || taxonomyPath} taxonomy "${e}"`);
  const catKeys = new Set(t.categories.map((c) => c.key));
  const tagKeys = new Set(t.tags.map((x) => x.key));
  const files = [];
  for (const loc of ["th", "en"]) {
    const d = join(root, "content", "posts", loc);
    if (existsSync(d)) for (const f of walkMdx(d)) files.push([loc, f]);
  }
  if (!files.length) throw new ToolError(`no posts under ${join(root, "content", "posts")}/{th,en}`);
  const counts = { th: new Map(), en: new Map() };
  for (const [loc, f] of files) {
    const rel = relative(root, f).split(sep).join("/");
    const r = checkPost(readFileSync(f, "utf8"), catKeys, tagKeys);
    for (const x of r.fails) lines.push(`TAXONOMY FAIL ${rel} ${x.field} ${JSON.stringify(x.value)}`);
    if (r.category && !r.draft) counts[loc].set(r.category, (counts[loc].get(r.category) || 0) + 1);
  }
  const visible = (loc) => t.categories.filter((c) => (counts[loc].get(c.key) || 0) >= (c.min_posts ?? 1)).length;
  const ok = lines.length === 0;
  if (ok) lines.push(`taxonomy OK · posts ${files.length} · categories ${t.categories.length} (visible th ${visible("th")} · en ${visible("en")}) · tags ${t.tags.length}`);
  return { ok, lines };
}

function main(argv) {
  let root = process.cwd();
  let taxonomy = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") root = resolve(argv[++i] ?? "");
    else if (argv[i] === "--taxonomy") taxonomy = resolve(argv[++i] ?? "");
    else throw new ToolError(`unknown argument ${argv[i]} (usage: check.mjs [--root DIR] [--taxonomy FILE])`);
  }
  if (!taxonomy) taxonomy = existsSync(join(root, "src/lib/taxonomy/taxonomy.json")) ? join(root, "src/lib/taxonomy/taxonomy.json") : DEFAULT_TAXONOMY;
  const { ok, lines } = checkTree(root, taxonomy);
  for (const l of lines) (ok ? console.log : console.error)(l);
  return ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`taxonomy guard error: ${e.message}`);
    process.exitCode = 2;
  }
}
