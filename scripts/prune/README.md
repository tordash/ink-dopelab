# Content prune (BM-16) — apply / revert, the prune map, the `/api/gone` 410 page

Ticket: tordash/dopelab-oracle#19. Decisions come from ต่อ's GO on #19 (Phase B); the list and
the rules are built in the dopelab repo (`deliverables/blog-migration/tools/prune_*.py`).
**Nothing is deleted:** a pruned post stays in git; it is only hidden.

## 1. Apply / revert

```bash
node scripts/prune/apply.mjs --list <list.tsv> [--root <repo dir>]   # apply (bucket=drop rows only)
node scripts/prune/apply.mjs --revert [--root <repo dir>]            # undo everything BM-16 did
```

- Apply changes exactly one frontmatter line per dropped post:
  `draft: false` → `draft: true # bm16-prune was=false`, or adds
  `draft: true # bm16-prune was=absent` when the post had no `draft:` line.
  velite already hides drafts everywhere a post is listed (lists, tags, categories, related,
  search, `generateStaticParams`, sitemap, feed) and the post URL answers 404.
- All-or-nothing: a missing slug, a real `draft: true`, an odd or duplicate `draft:` line, or a
  duplicate list row → exit 1 and nothing is written.
- A second apply prints `applied 0 · already k` and leaves every byte unchanged.
- Output: `applied N · already N · skipped N · map N entries` / `reverted N · map reset`.
  Exit 0 ok · 1 data error · 2 usage/IO.
- Then commit the MDX flag lines and `src/lib/prune/prune-map.json` together, and rebuild
  (`npm run build`): the link rewrite (§2) and the 410 handler (§3) read the map at build time.

## 2. `src/lib/prune/prune-map.json`

Written by `apply.mjs`, reset by `--revert`. Keys sorted, `JSON.stringify(o, null, 2) + "\n"`.
Committed empty state: `{"source": null, "posts": {}}`.

```json
{
  "source": "prune-dryrun.tsv sha256:0123456789ab",
  "posts": {
    "en/ai-pitch-deck-startup": { "rule": "R2", "kind": "list" },
    "th/100-hours-claude-code-lessons": { "rule": "R3", "kind": "gone" },
    "th/claude-update-roundup-march-2026": { "rule": "R2", "kind": "category", "category": "News & Tools" },
    "th/gpt54-release-quitgpt-backlash": { "rule": "R1", "kind": "post", "slug": "gpt54-vs-claude-coding-king" }
  }
}
```

Targets are structured (never hrefs) and always in the key's locale. `src/lib/prune/rehype-prune-links.mjs`
(velite rehype plugin) rewrites every body link to a pruned post straight to its target, in the same
form as the source link (legacy `/<loc>/blog/<slug>` on this base, `/blog/<slug>` · `/blog/en/<slug>`
after BM-04's MDX rewrite); a `gone` target turns the link into plain text. No kept MDX file is edited.

**Landing mode:** `list` targets use landing mode i (`…/all` in the new form, `/<loc>/blog` in the
legacy form). If the INK landing decision flips to mode ii, re-run apply + build (the redirect rules
already carry both modes in `to_by_mode`).

## 3. The 410 page — interface for BM-08 (#9)

```
GET <app>/api/gone?locale=<th|en>&slug=<slug>
```

`<app>` is empty on this base and `/blog` after BM-04 (the handler reads `request.nextUrl.basePath`).

| condition | answer |
|---|---|
| `prune-map.json` has `kind: "gone"` for `<locale>/<slug>` **and** velite holds that post with `draft: true` | **410** · `content-type: text/html; charset=utf-8` · `x-robots-tag: noindex` · `cache-control: public, max-age=0, s-maxage=3600` · no `Location` · body = TH + EN "retired" lines, a link to the list hub and to the blog home (never the main-site home) |
| anything else (no/invalid `locale`, malformed slug, a live post, an unknown slug) | **404** · `text/plain; charset=utf-8` · `x-robots-tag: noindex` · `cache-control: no-store` |

The handler is never linked, never in the sitemap or feed, and never answers 200.

**BM-08 wiring (zero hops, D8):** for every `gone` rule BM-08 emits from `url-rules.json`
(`X-GONE.*` legacy forms on the ink host, `N-GONE.*` paths on the new host), rewrite — do not
redirect — the request to the handler, so the asked URL itself answers 410:

```ts
// middleware.ts (sketch) — `gone` = { "<legacy or new path>": { locale, slug } } generated from the rules
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const hit = gone[req.nextUrl.pathname];
  if (hit) {
    const url = new URL(`${req.nextUrl.basePath}/api/gone?locale=${hit.locale}&slug=${hit.slug}`, req.url);
    return NextResponse.rewrite(url);
  }
}
```

A Cloudflare Worker can do the same with a `fetch` of the handler URL and return its 410 response.
Never answer a gone URL with a 301 that ends in a 410 (that is a redirect→410 chain; BM-03 P3 fails it).

## 4. Tests

```bash
node --test "scripts/prune/tests/*.test.mjs"
```

- `apply.test.mjs` — round trips byte-identical, idempotent, all-or-nothing, map serialization
- `rehype.test.mjs` — legacy/new/absolute forms × post/category/list/gone, query/fragment, mdxJsx `<a>`, empty map
- `gone-page.test.mjs` — noindex, TH+EN lines, hub/home hrefs for both bases, escaping, brand tokens

The end-to-end dry run (build, apply, build, crawl, revert) lives in the dopelab repo
(`deliverables/blog-migration/tools/prune_site_check.py`) and runs against a local `next start` only.
