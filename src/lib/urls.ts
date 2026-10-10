// BM-05 (SPEC §1.1, §3.1): the ONE place that turns a blog page into an absolute URL. Every emitter (canonical, og:url,
// JSON-LD url, hreflang, sitemap <loc>, feed links, robots Sitemap:) goes through src/lib/seo.ts, which binds this
// module to the build's SITE_URL / BASE_PATH / mode; nothing else concatenates an absolute blog URL.
// Pure, import-free, erasable TS (house rule of routes.ts / base-path.ts): every function takes its context as
// arguments, so node --test imports it directly.
//   normal mode   siteUrl + basePath + (en ? "/en" : "") + route         (home has no trailing slash)
//   mode off      legacy origin + the url-rules `from` template (legacy-routes.json, generated, ADR-01 05 R-b)
// og:image / twitter:image / JSON-LD image never flip: they always sit on siteUrl (D4, ADR-01 09).

export type Locale = "th" | "en";
export type PageKind = "home" | "list" | "about" | "contact" | "post" | "tag" | "category";
export type Page =
  | { kind: "home" | "list" | "about" | "contact" }
  | { kind: "post"; slug: string }
  | { kind: "tag"; value: string }
  | { kind: "category"; value: string };
export type FileKind = "sitemap" | "feed";
export type LegacyRoutes = {
  legacy_origin: string;
  routes: { th: Record<PageKind, string>; en: Record<PageKind, string>; files: Record<FileKind, string> };
};
export type UrlCtx = { siteUrl: string; basePath: string; inkCanonical: boolean; legacy: LegacyRoutes };
/** Values that exist in BOTH locales (= routes.ts SwitchIndex, built by getSharedSwitchIndex()). */
export type SharedIndex = { posts: string[]; tags: string[]; categories: string[] };

// = routes.ts ROUTES (locale-less, basePath-less); the unit test asserts equality with the routes.ts helpers.
const STATIC_ROUTES = { home: "/", list: "/all", about: "/about", contact: "/contact" };
const FILES = { sitemap: "/sitemap.xml", feed: "/feed.xml" };

/** "/", "/all", "/about", "/contact", "/<slug>", "/tag/<enc>", "/category/<enc>" (= routes.ts helpers). */
export function routePath(page: Page): string {
  switch (page.kind) {
    case "post":
      return `/${page.slug}`; // slugs are ASCII (velite slugAsParams)
    case "tag":
      return `/tag/${encodeURIComponent(page.value)}`;
    case "category":
      return `/category/${encodeURIComponent(page.value)}`;
    default:
      return STATIC_ROUTES[page.kind];
  }
}

/** basePath + (en ? "/en" : "") + route; the home route adds nothing (no trailing slash). */
export function newPath(page: Page, locale: Locale, basePath: string): string {
  const route = routePath(page);
  return basePath + (locale === "en" ? "/en" : "") + (route === "/" ? "" : route);
}

/** The legacy template for (locale, kind): ":slug" → the slug, ":tag" / ":cat" → encodeURIComponent(value). */
export function legacyPath(page: Page, locale: Locale, legacy: LegacyRoutes): string {
  const template = legacy.routes[locale][page.kind];
  const param = page.kind === "post" ? page.slug : page.kind === "tag" || page.kind === "category" ? encodeURIComponent(page.value) : "";
  return template.replace(/:(slug|tag|cat)$/, () => param);
}

export function absoluteUrl(page: Page, locale: Locale, ctx: UrlCtx): string {
  return ctx.inkCanonical
    ? ctx.legacy.legacy_origin + legacyPath(page, locale, ctx.legacy)
    : ctx.siteUrl + newPath(page, locale, ctx.basePath);
}

export function fileUrl(kind: FileKind, ctx: UrlCtx): string {
  return ctx.inkCanonical ? ctx.legacy.legacy_origin + ctx.legacy.routes.files[kind] : ctx.siteUrl + ctx.basePath + FILES[kind];
}

/** REQ D6: static routes exist in both locales; a post/tag/category only when its exact value is in the shared index. */
export function localeSet(page: Page, locale: Locale, shared: SharedIndex): Locale[] {
  const both: Locale[] = ["th", "en"];
  switch (page.kind) {
    case "post":
      return shared.posts.includes(page.slug) ? both : [locale];
    case "tag":
      return shared.tags.includes(page.value) ? both : [locale];
    case "category":
      return shared.categories.includes(page.value) ? both : [locale];
    default:
      return both;
  }
}

/** Paired → { th, en, "x-default": th } (reciprocal by construction); one locale → undefined (no alternates at all). */
export function hreflangs(page: Page, locale: Locale, shared: SharedIndex, ctx: UrlCtx): Record<string, string> | undefined {
  if (localeSet(page, locale, shared).length < 2) return undefined;
  const th = absoluteUrl(page, "th", ctx);
  return { th, en: absoluteUrl(page, "en", ctx), "x-default": th };
}

/** The generated OG image (api/og) on the site host: same query as before BM-05, now under the basePath. */
export function ogImageUrl(o: { title: string; locale: Locale; category?: string }, siteUrl: string, basePath: string): string {
  const q = `title=${encodeURIComponent(o.title)}&locale=${o.locale}` + (o.category ? `&category=${encodeURIComponent(o.category)}` : "");
  return `${siteUrl}${basePath}/api/og?${q}`;
}

/** A velite cover src already starts with the basePath (velite `base`), so only the origin is added. */
export function coverUrl(src: string, siteUrl: string): string {
  return siteUrl + src;
}

/** The OG image corner text: the site host + basePath (AC7). */
export function ogFooterText(siteUrl: string, basePath: string): string {
  return new URL(siteUrl).host + basePath;
}

/**
 * S-3 (Q5 default): fail the build when the site origin is the legacy ink host. That shape (legacy host + basePath)
 * is one ink redirects away from; the R-b rollback uses INK_REDIRECT_MODE=off, never a SITE_URL swap.
 */
export function assertSiteUrl(siteUrl: string, legacyOrigin: string): void {
  if (new URL(siteUrl).host === new URL(legacyOrigin).host) {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL=${JSON.stringify(siteUrl)} is not supported: it is the legacy ink host, so every canonical ` +
        `would be a URL ink redirects. Use the new origin (or unset it for the code fallback); for the R-b rollback set ` +
        `INK_REDIRECT_MODE=off instead (BM-05 S-3).`,
    );
  }
}
