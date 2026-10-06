// BM-16 · rehype-prune-links on hand-built hast trees (SPEC §9.2, S2 · REQ AC5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import rehypePruneLinks from "../../../src/lib/prune/rehype-prune-links.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const POSTS = {
  "th/post-r1": { rule: "R1", kind: "post", slug: "kept-one" },
  "en/post-r1": { rule: "R1", kind: "post", slug: "kept-one" },
  "th/cat-r2": { rule: "R2", kind: "category", category: "News & Tools" },
  "en/cat-r2": { rule: "R2", kind: "category", category: "AI Workflow" },
  "th/list-r2": { rule: "R2", kind: "list" },
  "en/list-r2": { rule: "R2", kind: "list" },
  "th/gone-r3": { rule: "R3", kind: "gone" },
};

const a = (href, text = "link") => ({ type: "element", tagName: "a", properties: { href }, children: [{ type: "text", value: text }] });
const p = (...children) => ({ type: "element", tagName: "p", properties: {}, children });
const root = (...children) => ({ type: "root", children });
const run = (tree, posts = POSTS) => {
  rehypePruneLinks({ posts })(tree);
  return tree;
};
const hrefOf = (href, posts = POSTS) => run(root(p(a(href))), posts).children[0].children[0].properties.href;

test("legacy form x post/category/list", () => {
  assert.equal(hrefOf("/th/blog/post-r1"), "/th/blog/kept-one");
  assert.equal(hrefOf("/en/blog/post-r1"), "/en/blog/kept-one");
  assert.equal(hrefOf("/th/blog/cat-r2"), "/th/blog/category/News%20%26%20Tools");
  assert.equal(hrefOf("/en/blog/cat-r2"), "/en/blog/category/AI%20Workflow");
  assert.equal(hrefOf("/th/blog/list-r2"), "/th/blog");
  assert.equal(hrefOf("/en/blog/list-r2"), "/en/blog");
});

test("new form (after BM-04) x post/category/list", () => {
  assert.equal(hrefOf("/blog/post-r1"), "/blog/kept-one");
  assert.equal(hrefOf("/blog/en/post-r1"), "/blog/en/kept-one");
  assert.equal(hrefOf("/blog/cat-r2"), "/blog/category/News%20%26%20Tools");
  assert.equal(hrefOf("/blog/en/cat-r2"), "/blog/en/category/AI%20Workflow");
  assert.equal(hrefOf("/blog/list-r2"), "/blog/all");
  assert.equal(hrefOf("/blog/en/list-r2"), "/blog/en/all");
});

test("absolute forms keep their origin", () => {
  assert.equal(hrefOf("https://ink.dopelab.studio/th/blog/post-r1"), "https://ink.dopelab.studio/th/blog/kept-one");
  assert.equal(hrefOf("http://ink.dopelab.studio/en/blog/list-r2"), "http://ink.dopelab.studio/en/blog");
  assert.equal(hrefOf("https://dopelab.studio/blog/cat-r2"), "https://dopelab.studio/blog/category/News%20%26%20Tools");
  assert.equal(hrefOf("https://dopelab.studio/blog/en/post-r1"), "https://dopelab.studio/blog/en/kept-one");
});

test("query kept, fragment dropped, one trailing slash ignored", () => {
  assert.equal(hrefOf("/th/blog/post-r1?utm_source=x#top"), "/th/blog/kept-one?utm_source=x");
  assert.equal(hrefOf("/th/blog/post-r1/"), "/th/blog/kept-one");
  assert.equal(hrefOf("/blog/list-r2/?a=1"), "/blog/all?a=1");
});

test("gone: the <a> is replaced by its children (plain text), in every form", () => {
  for (const href of ["/th/blog/gone-r3", "/blog/gone-r3", "https://ink.dopelab.studio/th/blog/gone-r3#x"]) {
    const tree = run(root(p({ type: "text", value: "see " }, a(href, "the old post"), { type: "text", value: "." })));
    assert.deepEqual(tree.children[0].children.map((n) => n.type), ["text", "text", "text"], href);
    assert.equal(tree.children[0].children[1].value, "the old post");
  }
});

test("unknown slugs and non-post links are untouched", () => {
  for (const href of ["/th/blog/kept-one", "/th/blog/tag/post-r1", "/th/blog/category/post-r1", "/th/blog",
                      "/blog/all", "/videos/post-r1.mp4", "https://example.com/th/blog/post-r1", "#post-r1",
                      "mailto:a@b.c", "/fr/blog/post-r1", "/th/blog/post-r1/extra"]) {
    assert.equal(hrefOf(href), href, href);
  }
});

test("mdxJsx elements named a with a literal href", () => {
  const jsx = (type) => ({ type, name: "a", attributes: [{ type: "mdxJsxAttribute", name: "href", value: "/th/blog/cat-r2" },
                                                         { type: "mdxJsxAttribute", name: "className", value: "x" }],
                           children: [{ type: "text", value: "c" }] });
  const tree = run(root(p(jsx("mdxJsxTextElement")), jsx("mdxJsxFlowElement")));
  assert.equal(tree.children[0].children[0].attributes[0].value, "/th/blog/category/News%20%26%20Tools");
  assert.equal(tree.children[1].attributes[0].value, "/th/blog/category/News%20%26%20Tools");
  const gone = { type: "mdxJsxTextElement", name: "a", attributes: [{ type: "mdxJsxAttribute", name: "href", value: "/th/blog/gone-r3" }],
                 children: [{ type: "text", value: "g" }] };
  const t2 = run(root(p(gone)));
  assert.deepEqual(t2.children[0].children, [{ type: "text", value: "g" }]);
  const expr = { type: "mdxJsxTextElement", name: "a",
                 attributes: [{ type: "mdxJsxAttribute", name: "href", value: { type: "mdxJsxAttributeValueExpression", value: "x" } }],
                 children: [] };
  assert.deepEqual(run(root(p(structuredClone(expr)))).children[0].children[0], expr);   // non-literal href untouched
});

test("an empty map changes nothing (the committed map)", () => {
  const tree = root(p(a("/th/blog/post-r1"), a("/th/blog/gone-r3")));
  const before = structuredClone(tree);
  rehypePruneLinks({ posts: {} })(tree);
  assert.deepEqual(tree, before);
  const committed = JSON.parse(readFileSync(join(HERE, "..", "..", "..", "src", "lib", "prune", "prune-map.json"), "utf8"));
  const t2 = structuredClone(before);
  rehypePruneLinks({ posts: committed.posts })(t2);
  assert.deepEqual(t2, before);
});

test("without options it reads src/lib/prune/prune-map.json from process.cwd()", () => {
  const cwd = process.cwd();
  try {
    process.chdir(join(HERE, "..", "..", ".."));
    const tree = root(p(a("/th/blog/post-r1")));
    const before = structuredClone(tree);
    rehypePruneLinks()(tree);
    assert.deepEqual(tree, before);                       // committed map is empty
  } finally {
    process.chdir(cwd);
  }
});

test("the plugin source has no quoted /blog literal and imports only node:fs / node:path", () => {
  const src = readFileSync(join(HERE, "..", "..", "..", "src", "lib", "prune", "rehype-prune-links.mjs"), "utf8");
  assert.equal(/["'`]\/blog/.test(src), false);
  const imports = [...src.matchAll(/^import .* from ["']([^"']+)["']/gm)].map((m) => m[1]);
  assert.deepEqual(imports.filter((x) => !["node:fs", "node:path"].includes(x)), []);
});
