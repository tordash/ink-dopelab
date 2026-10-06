// BM-16 · rehype plugin: kept posts never link into the prune (tordash/dopelab-oracle#19 · SPEC §9.2, S2).
//
// At velite build time every link from a post body to a pruned post is rewritten straight to its
// final target (R1 same-topic post, R2 category or list hub) or, for R3 (gone), the <a> is replaced
// by its children (plain text). No kept MDX file is edited, and an empty map changes nothing.
//
// The map is src/lib/prune/prune-map.json (written by scripts/prune/apply.mjs), read from
// process.cwd() (velite runs from the repo root) unless `{ posts }` is passed. It holds structured
// targets, never hrefs, and the rewritten href keeps the form of the href it replaces:
//   legacy  /<loc>/blog/<slug>            (this base, before BM-04)
//   new     /blog/<slug> · /blog/en/<slug> (after BM-04's MDX rewrite)
// with or without the https://ink.dopelab.studio / https://dopelab.studio origin. `?query` is kept,
// `#fragment` dropped, one trailing "/" ignored. Paths are composed from segments on purpose: this
// file holds no quoted blog-path literal (BM-04 base-path invariant).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ORIGIN = /^(https?:\/\/(?:ink\.)?dopelab\.studio)(?=[/?#]|$)/;
const LOCALES = new Set(["th", "en"]);
const BLOG = "blog";

function loadMap() {
  const p = join(process.cwd(), "src", "lib", "prune", "prune-map.json");
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, "utf8")).posts || {};
}

/** Parse a post href in either form -> { origin, form, loc, slug, query } or null. */
export function parsePostHref(href) {
  if (typeof href !== "string") return null;
  let rest = href;
  let origin = "";
  const m = ORIGIN.exec(rest);
  if (m) {
    origin = m[1];
    rest = rest.slice(origin.length);
  }
  if (!rest.startsWith("/")) return null;
  const hash = rest.indexOf("#");
  if (hash !== -1) rest = rest.slice(0, hash);
  let query = "";
  const q = rest.indexOf("?");
  if (q !== -1) {
    query = rest.slice(q);
    rest = rest.slice(0, q);
  }
  if (rest.length > 1 && rest.endsWith("/")) rest = rest.slice(0, -1);
  const segs = rest.split("/").slice(1);
  if (segs.length === 3 && LOCALES.has(segs[0]) && segs[1] === BLOG && segs[2]) {
    return { origin, form: "legacy", loc: segs[0], slug: segs[2], query };
  }
  if (segs.length === 2 && segs[0] === BLOG && segs[1] && segs[1] !== "en") {
    return { origin, form: "new", loc: "th", slug: segs[1], query };
  }
  if (segs.length === 3 && segs[0] === BLOG && segs[1] === "en" && segs[2]) {
    return { origin, form: "new", loc: "en", slug: segs[2], query };
  }
  return null;
}

/** The replacement href for a parsed link and its map entry (null = unwrap, for gone). */
export function composeHref(parsed, entry) {
  if (entry.kind === "gone") return null;
  const prefix = parsed.form === "legacy" ? [parsed.loc, BLOG] : parsed.loc === "en" ? [BLOG, "en"] : [BLOG];
  let segs;
  if (entry.kind === "post") segs = [...prefix, entry.slug];
  else if (entry.kind === "category") segs = [...prefix, "category", encodeURIComponent(entry.category)];
  else if (entry.kind === "list") segs = parsed.form === "legacy" ? prefix : [...prefix, "all"];
  else return undefined;
  return `${parsed.origin}/${segs.join("/")}${parsed.query}`;
}

function hrefAttr(node) {
  if (node.type === "element" && node.tagName === "a" && node.properties && typeof node.properties.href === "string") {
    return { get: () => node.properties.href, set: (v) => { node.properties.href = v; } };
  }
  if ((node.type === "mdxJsxTextElement" || node.type === "mdxJsxFlowElement") && node.name === "a") {
    const attr = (node.attributes || []).find((x) => x.type === "mdxJsxAttribute" && x.name === "href");
    if (attr && typeof attr.value === "string") return { get: () => attr.value, set: (v) => { attr.value = v; } };
  }
  return null;
}

export default function rehypePruneLinks({ posts } = {}) {
  const map = posts || loadMap();
  const active = Object.keys(map).length > 0;
  return (tree) => {
    if (!active) return;
    const walk = (parent) => {
      if (!parent.children) return;
      const out = [];
      for (const node of parent.children) {
        const h = hrefAttr(node);
        const parsed = h && parsePostHref(h.get());
        const entry = parsed && map[`${parsed.loc}/${parsed.slug}`];
        if (entry) {
          const next = composeHref(parsed, entry);
          if (next === null) {
            walk(node);
            out.push(...(node.children || []));
            continue;
          }
          if (typeof next === "string") h.set(next);
        }
        walk(node);
        out.push(node);
      }
      parent.children = out;
    };
    walk(tree);
  };
}
