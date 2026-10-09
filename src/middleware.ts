import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);
// [locale]=th + [slug]=th: "th" is a reserved slug (guard), so this can never be a page → styled 404 (same as unknown post)
const NOT_FOUND_INTERNAL = `/${routing.defaultLocale}/${routing.defaultLocale}`;

function notFound(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = NOT_FOUND_INTERNAL;
  url.search = "";
  return NextResponse.rewrite(url);
}

export default function middleware(request: NextRequest) {
  const first = request.nextUrl.pathname.split("/")[1] ?? "";
  const lower = first.toLowerCase();
  const isLocaleWord = (routing.locales as readonly string[]).includes(lower);
  // U1: default locale never appears in the URL (/blog/th/* → 404, REQ F6); locale words are case-sensitive (/blog/EN/* → 404)
  if (isLocaleWord && (lower === routing.defaultLocale || first !== lower)) return notFound(request);
  const res = intl(request);
  if (res.status >= 300 && res.status < 400) return notFound(request); // REQ §4.3: next-intl never answers 3xx under /blog
  return res;
}

export const config = {
  matcher: [
    "/",
    // NOT: Next internals, Vercel insights, API, the public/ dirs (keep in sync with public/ — the guard checks it),
    // and single-segment names with a dot (public root files, feed.xml, robots.txt, sitemap.xml, icon.jpg …).
    // Dotted tags (/tag/gpt-5.4) still match: they have two segments.
    "/((?!api/|api$|_next/|_vercel/|static/|images/|videos/|diagrams/)(?![^/]*\\.[^/]*$).*)",
  ],
};
