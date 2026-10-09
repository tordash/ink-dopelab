// BM-16 · GET <app>/api/gone?locale=<th|en>&slug=<slug> -> the custom 410 page of a retired post
// (tordash/dopelab-oracle#19 · SPEC §9.3, S3). <app> = empty on this base, the /blog basePath after BM-04.
//
// 410 only when prune-map.json says `kind: "gone"` for <locale>/<slug> AND velite holds that post
// with draft === true (applied by scripts/prune/apply.mjs). Everything else -> 404 text/plain
// (missing/invalid locale, malformed slug, a live post, an unknown slug), so this path is never a
// crawlable 200. BM-08 reaches it with a middleware/Worker rewrite for every `gone` rule, so the
// asked URL itself answers 410 with zero hops (interface: scripts/prune/README.md).
//
// The map and the posts are imported statically (bundled at build time), never read from disk at
// request time, so the handler behaves the same on `next start` and on Vercel.
import type { NextRequest } from "next/server";
import { posts } from "#site/content";
import { BASE_PATH } from "@/lib/base-path";
import { ROUTES } from "@/lib/routes";
import pruneMap from "@/lib/prune/prune-map.json";
import { renderGonePage, goneHrefs, type GoneLocale } from "@/lib/prune/gone-page";

const SLUG = /^[a-z0-9-]+$/;
const MAP = pruneMap as unknown as { posts: Record<string, { rule?: string; kind?: string }> };

function notFound(): Response {
  return new Response("Not Found\n", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-robots-tag": "noindex",
      "cache-control": "no-store",
    },
  });
}

export function GET(request: NextRequest): Response {
  const params = request.nextUrl.searchParams;
  const locale = params.get("locale");
  const slug = params.get("slug");
  if ((locale !== "th" && locale !== "en") || !slug || !SLUG.test(slug)) return notFound();
  const entry = MAP.posts[`${locale}/${slug}`];
  if (!entry || entry.kind !== "gone") return notFound();
  const post = posts.find((p) => p.locale === locale && p.slugAsParams === slug);
  if (!post || post.draft !== true) return notFound();
  const loc = locale as GoneLocale;
  // review F3: links from BM-04's BASE_PATH + ROUTES, never the request's basePath (empty in a route handler, SPEC R4)
  const html = renderGonePage({ locale: loc, title: post.title, ...goneHrefs(loc, BASE_PATH, ROUTES) });
  return new Response(html, {
    status: 410,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
