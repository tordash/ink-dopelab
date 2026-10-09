// BM-16 · code-review regression (tordash/dopelab-oracle#19 · REQ §5.1 "flag on exactly the drop rows" · AC10).
// Re-applying a SMALLER list (ต่อ changes his answer, or GSC data moves a row back, REQ D4 / SPEC R9) must not
// leave a post hidden that is no longer in the list: that post would be unpublished without approval, have no
// prune-map entry (no link rewrite, no 410) and no redirect rule, so its URL would 404.
// Either fix shape passes: (a) apply syncs (restores markers not in the list) or (b) apply refuses and writes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyList } from "../apply.mjs";

const HEAD = "locale\tslug\tbucket\trule\ttarget";
const ROW = (slug) => `th\t${slug}\tdrop\tR2\thttps://dopelab.studio/blog/all`;

function setup() {
  const r = mkdtempSync(join(tmpdir(), "bm16-review-"));
  mkdirSync(join(r, "content", "posts", "th"), { recursive: true });
  for (const s of ["aa", "bb"]) {
    writeFileSync(join(r, "content", "posts", "th", `${s}.mdx`), `---\ntitle: "${s}"\ndraft: false\n---\nbody ${s}\n`);
  }
  writeFileSync(join(r, "list2.tsv"), [HEAD, ROW("aa"), ROW("bb"), ""].join("\n"));
  writeFileSync(join(r, "list1.tsv"), [HEAD, ROW("aa"), ""].join("\n"));
  return r;
}

const draftLine = (r, s) => readFileSync(join(r, "content", "posts", "th", `${s}.mdx`), "utf8").split("\n")[2];
const mapKeys = (r) => Object.keys(JSON.parse(readFileSync(join(r, "src", "lib", "prune", "prune-map.json"), "utf8")).posts);

test("re-apply with a smaller list leaves no stale hidden post (sync or refuse)", () => {
  const r = setup();
  assert.equal(applyList({ root: r, listPath: join(r, "list2.tsv") }).code, 0);
  assert.equal(draftLine(r, "bb"), "draft: true # bm16-prune was=false");
  const res = applyList({ root: r, listPath: join(r, "list1.tsv") });
  if (res.code === 0) {
    // (a) sync: bb is published again, map holds exactly the list
    assert.equal(draftLine(r, "bb"), "draft: false", `bb still hidden after re-apply without it: ${res.lines.join(" | ")}`);
    assert.deepEqual(mapKeys(r), ["th/aa"]);
  } else {
    // (b) refuse: nothing written, the previous state is intact and consistent
    assert.equal(draftLine(r, "bb"), "draft: true # bm16-prune was=false");
    assert.deepEqual(mapKeys(r), ["th/aa", "th/bb"]);
  }
  // in every case: a hidden post always has a map entry (draft marker set == map key set)
  const hidden = ["aa", "bb"].filter((s) => draftLine(r, s).includes("# bm16-prune")).map((s) => `th/${s}`);
  assert.deepEqual(hidden, mapKeys(r));
});
