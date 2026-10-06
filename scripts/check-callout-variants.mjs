#!/usr/bin/env node
// Guard: every <Callout variant="..."> used in content/posts must exist in src/components/mdx/callout.tsx.
// An unknown variant used to crash the post page (HTTP 500 on 5 Thai posts, 6 Oct 2026).
// Usage: node scripts/check-callout-variants.mjs   (exit 0 = ok · 1 = unknown variant found)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const src = readFileSync(join(root, "src/components/mdx/callout.tsx"), "utf8");
const block = src.slice(src.indexOf("const variants = {"), src.indexOf("};", src.indexOf("const variants = {")));
const known = new Set([...block.matchAll(/^ {2}([a-z]+): \{/gm)].map((m) => m[1]));

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".mdx")) files.push(p);
  }
};
walk(join(root, "content/posts"));

let bad = 0;
let uses = 0;
for (const f of files) {
  for (const m of readFileSync(f, "utf8").matchAll(/<Callout[^>]*\bvariant="([^"]+)"/g)) {
    uses++;
    if (!known.has(m[1])) {
      bad++;
      console.log(`UNKNOWN variant="${m[1]}" in ${f.slice(root.length)}`);
    }
  }
}
console.log(`variants: ${[...known].join(", ")} · ${files.length} posts · ${uses} Callout variant uses · ${bad} unknown`);
process.exit(bad ? 1 : 0);
