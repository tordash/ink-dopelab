#!/usr/bin/env node
// BM-04 reserved-slug guard (SPEC §5.8, REQ AC4). First step of `npm run build`, before velite.
// Node stdlib only · run from the repo root · reads no env · never writes.
//
// A post slug (first path segment of content/posts/{th,en}/**/*.mdx, compared in lowercase) must not be:
//   RESERVED  listed in the vendored url-rules.json reserved_slugs, or derived from this tree exactly like
//             BM-03 check_redirects.py derive_reserved: public/ entries · route dirs of src/app and
//             src/app/[locale] (not [ ( _ @ .) · metadata outputs in src/app (icon.*, robots.ts → robots.txt …)
//   DOTTED    contain a "." — single-segment dotted paths skip the middleware matcher, so the post would 404
// and every top-level public/ dir must appear as "<dir>/" in the src/middleware.ts matcher (MATCHER).
// Lines 2–4 of the output equal BM-03 `check_redirects.py --check-reserved --ink-repo <tree>` lines 2–4.
// Exit 0 ok · 1 any violation (all are reported first) · 2 tool error (missing/invalid input).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const LIST = join(ROOT, "scripts/migration/reserved-slugs.json");
const METADATA_PREFIXES = ["icon.", "apple-icon.", "opengraph-image.", "twitter-image."];
const METADATA_FILES = new Set(["favicon.ico"]);
const METADATA_ROUTES = {
  "robots.ts": "robots.txt", "robots.js": "robots.txt", "robots.txt": "robots.txt",
  "sitemap.ts": "sitemap.xml", "sitemap.js": "sitemap.xml", "sitemap.xml": "sitemap.xml",
  "manifest.ts": "manifest.webmanifest", "manifest.webmanifest": "manifest.webmanifest",
};
const LOCALES = ["th", "en"];

function toolError(msg) {
  console.error(`BM-04 reserved-slug guard · TOOL ERROR · ${msg}`);
  process.exit(2);
}

const ls = (d) => (existsSync(d) && statSync(d).isDirectory() ? readdirSync(d, { withFileTypes: true }) : []);

/** name (lowercase) → [source, …] — same rules as BM-03 derive_reserved (check_redirects.py). */
function deriveReserved() {
  const out = new Map();
  const add = (name, src) => {
    const k = name.toLowerCase();
    out.set(k, [...(out.get(k) ?? []), src]);
  };
  for (const e of ls(join(ROOT, "public"))) if (!e.name.startsWith(".")) add(e.name, `public/${e.name}`);
  for (const rel of ["src/app", "src/app/[locale]"]) {
    for (const e of ls(join(ROOT, rel))) {
      if (e.isDirectory() && !/^[[(_@.]/.test(e.name)) add(e.name, `${rel}/${e.name}`);
    }
  }
  for (const e of ls(join(ROOT, "src/app"))) {
    if (!e.isFile()) continue;
    if (METADATA_PREFIXES.some((p) => e.name.startsWith(p)) || METADATA_FILES.has(e.name)) add(e.name, `src/app/${e.name}`);
    else if (METADATA_ROUTES[e.name]) add(METADATA_ROUTES[e.name], `src/app/${e.name}`);
  }
  return out;
}

function walkMdx(dir) {
  const files = [];
  for (const e of ls(dir)) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...walkMdx(p));
    else if (e.isFile() && e.name.endsWith(".mdx")) files.push(p);
  }
  return files.sort();
}

/** [locale, file (repo-relative), slug] — slug = first segment of the .mdx stem under content/posts/<locale>/. */
function postSlugs() {
  const out = [];
  for (const loc of LOCALES) {
    const base = join(ROOT, "content/posts", loc);
    for (const f of walkMdx(base)) {
      const rel = relative(base, f).split(sep);
      rel[rel.length - 1] = rel[rel.length - 1].replace(/\.mdx$/, "");
      out.push([loc, relative(ROOT, f).split(sep).join("/"), rel[0]]);
    }
  }
  return out;
}

let vendored;
try {
  vendored = JSON.parse(readFileSync(LIST, "utf8"));
} catch (e) {
  toolError(`cannot read ${relative(ROOT, LIST)}: ${e.message}`);
}
if (!Array.isArray(vendored.reserved_slugs) || !vendored.reserved_slugs.every((s) => typeof s === "string")) {
  toolError(`${relative(ROOT, LIST)}: reserved_slugs must be an array of strings`);
}
if (!existsSync(join(ROOT, "content/posts"))) toolError(`no content/posts under ${ROOT} (run from the repo root)`);

const listed = new Set(vendored.reserved_slugs.map((s) => s.toLowerCase()));
const derived = deriveReserved();
const reserved = new Set([...listed, ...derived.keys()]);
const slugs = postSlugs();

const lines = [];
let collisions = 0;
let dotted = 0;
for (const [, file, slug] of slugs) {
  const k = slug.toLowerCase();
  if (reserved.has(k)) {
    collisions += 1;
    const src = [];
    if (listed.has(k)) src.push("listed in url-rules.json reserved_slugs");
    for (const d of derived.get(k) ?? []) src.push(`derived from ${d}`);
    lines.push(`RESERVED ${file} -> ${k} (${src.join("; ")})`);
  }
  if (slug.includes(".")) {
    dotted += 1;
    lines.push(`DOTTED ${file} -> ${k} (a dotted slug skips the middleware matcher, so the post would 404)`);
  }
}

// MATCHER: every top-level public/ dir must be excluded in the middleware matcher as "<dir>/".
let matcherText = "";
try {
  const mw = readFileSync(join(ROOT, "src/middleware.ts"), "utf8");
  matcherText = mw.slice(mw.indexOf("matcher"));
} catch (e) {
  toolError(`cannot read src/middleware.ts: ${e.message}`);
}
let matcherMiss = 0;
for (const e of ls(join(ROOT, "public"))) {
  if (e.isDirectory() && !e.name.startsWith(".") && !matcherText.includes(`${e.name}/`)) {
    matcherMiss += 1;
    lines.push(`MATCHER public/${e.name}/ is not excluded in the src/middleware.ts matcher (add "${e.name}/")`);
  }
}

const perLoc = LOCALES.map((l) => [l, slugs.filter((s) => s[0] === l).length]).filter(([, n]) => n > 0);
const derivedOnly = [...derived.keys()].filter((k) => !listed.has(k)).sort();
const v = vendored.version ?? "?";
console.log(`BM-04 reserved-slug guard · vendored url-rules v${v} · ink ${ROOT}`);
console.log(
  `slugs ${slugs.length} · collisions ${collisions} · reserved_slugs ${listed.size} · derived ${derived.size} · reserved total ${reserved.size}`,
);
console.log("  posts per locale: " + perLoc.map(([l, n]) => `${l} ${n}`).join(" · "));
console.log("  derived from ink: " + derivedOnly.join(" "));
console.log(`  dotted ${dotted} · matcher misses ${matcherMiss}`);
for (const l of lines) console.log(l);
const code = lines.length ? 1 : 0;
console.log(`RESULT ${code ? "FAIL" : "PASS"} exit ${code}`);
process.exit(code);
