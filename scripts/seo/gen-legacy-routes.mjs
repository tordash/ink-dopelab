#!/usr/bin/env node
// BM-05 (SPEC §3.1, REQ D3): derive the mode-off legacy map src/lib/legacy-routes.json from BM-03 url-rules.json.
//
//   node scripts/seo/gen-legacy-routes.mjs --rules <url-rules.json> [--out <file>] [--check]
//
// For every ALLOWED rule (R-HOME.*, R-LIST.th/en, R-PAGE.*, R-TAG.*, R-CAT.*, R-POST.*, R-FEED.*) the mode-i destination
// (`to`, else `to_by_mode[landing_mode]`) names exactly one new route shape; the rule's `from` becomes that shape's
// legacy template. X-*, R-ROOT, R-LIST.bare, R-LOCLESS and R-FALLBACK.* are never used: those sources redirect on ink.
// Same algorithm as derive_legacy_routes() in stories/BM-05/data/gen_spec_data.py. stdlib only.
//
//   exit 0  written (or --check: committed file == generated, drift 0)
//   exit 1  --check: drift (prints both sha256)
//   exit 2  the rules do not give exactly one rule per shape, a `from` is a list, or bad usage
// Writes only --out (default src/lib/legacy-routes.json). Never deletes anything.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ALLOWED = /^(R-HOME\.(th|en)|R-LIST\.(th|en)|R-PAGE\.(th|en)-(about|contact)|R-TAG\.(th|en)|R-CAT\.(th|en)|R-POST\.(th|en)|R-FEED\.(feed|sitemap))$/;
// Static route shapes (= src/lib/routes.ts ROUTES, locale-less and basePath-less; the unit test asserts equality).
const STATIC = [["home", "/"], ["list", "/all"], ["about", "/about"], ["contact", "/contact"]];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function die(code, msg) {
  console.error(`gen-legacy-routes: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const a = { rules: undefined, out: resolve(REPO, "src/lib/legacy-routes.json"), check: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--rules") a.rules = argv[++i];
    else if (argv[i] === "--out") a.out = resolve(argv[++i]);
    else if (argv[i] === "--check") a.check = true;
    else die(2, `unknown argument ${JSON.stringify(argv[i])}`);
  }
  if (!a.rules) die(2, "usage: --rules <url-rules.json> [--out <file>] [--check]");
  return a;
}

/** The new route shape (basePath + en prefix + route) each allowed rule must land on, keyed by template. */
function shapes(base) {
  const s = new Map();
  for (const loc of ["th", "en"]) {
    const pre = base + (loc === "en" ? "/en" : "");
    for (const [kind, route] of STATIC) s.set(route === "/" ? pre : pre + route, [loc, kind]);
    s.set(`${pre}/:slug`, [loc, "post"]);
    s.set(`${pre}/tag/:tag`, [loc, "tag"]);
    s.set(`${pre}/category/:cat`, [loc, "category"]);
  }
  s.set(`${base}/sitemap.xml`, ["files", "sitemap"]);
  s.set(`${base}/feed.xml`, ["files", "feed"]);
  return s;
}

export function deriveLegacyRoutes(rules, rulesSha) {
  const mode = rules.landing_mode;
  const base = rules.base_path;
  if (typeof base !== "string" || !base.startsWith("/")) die(2, `url-rules base_path ${JSON.stringify(base)} is not a path`);
  const shape = shapes(base);
  const routes = { th: {}, en: {}, files: {} };
  const used = new Map();
  for (const r of rules.rules) {
    if (!ALLOWED.test(r.id)) continue;
    const to = r.to ?? (r.to_by_mode ?? {})[mode];
    const key = shape.get(to);
    if (!key) die(2, `allowed rule ${r.id} has destination ${JSON.stringify(to)} that is no known route shape`);
    const [loc, kind] = key;
    if (kind in routes[loc]) die(2, `two allowed rules for ${loc}/${kind}: ${used.get(`${loc}/${kind}`)} and ${r.id}`);
    if (typeof r.from !== "string") die(2, `allowed rule ${r.id} has a list \`from\`; the inverse needs one source`);
    routes[loc][kind] = r.from;
    used.set(`${loc}/${kind}`, r.id);
  }
  const missing = [];
  for (const loc of ["th", "en"]) {
    for (const kind of [...STATIC.map(([k]) => k), "post", "tag", "category"]) if (!(kind in routes[loc])) missing.push(`${loc}/${kind}`);
  }
  for (const kind of ["sitemap", "feed"]) if (!(kind in routes.files)) missing.push(`files/${kind}`);
  if (missing.length) die(2, `no allowed rule for ${missing.join(", ")}`);
  const legacyOrigin = rules.hosts?.legacy;
  if (!/^https:\/\/[^/]+$/.test(legacyOrigin ?? "")) die(2, `url-rules hosts.legacy ${JSON.stringify(legacyOrigin)} is not an https origin`);
  return {
    rules_version: rules.version,
    rules_sha256: rulesSha,
    landing_mode: mode,
    legacy_origin: legacyOrigin,
    routes,
    rule_ids: Object.fromEntries([...used.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  };
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const raw = readFileSync(a.rules);
  const rulesSha = sha256(raw);
  const text = JSON.stringify(deriveLegacyRoutes(JSON.parse(raw.toString("utf8")), rulesSha), null, 1) + "\n";
  const gen = sha256(text);
  console.log(`rules ${a.rules} · rules sha256 ${rulesSha}`);
  if (a.check) {
    const committed = existsSync(a.out) ? readFileSync(a.out) : Buffer.alloc(0);
    const com = sha256(committed);
    const same = committed.toString("utf8") === text;
    console.log(`generated sha256 ${gen} · committed sha256 ${com} (${a.out})`);
    console.log(same ? "drift 0 · RESULT PASS" : "drift 1 · RESULT FAIL (re-run without --check and commit)");
    process.exit(same ? 0 : 1);
  }
  writeFileSync(a.out, text);
  console.log(`written ${a.out} · sha256 ${gen}`);
}

main();
