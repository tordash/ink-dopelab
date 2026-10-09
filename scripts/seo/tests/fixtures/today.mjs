// BM-05 AC13 red-run fixture (SPEC §5.2): TODAY's behaviour (ink bm/BM-15-static @ 6478f61, before BM-05) behind the
// API of src/lib/{urls,seo-env,site}.ts + legacy-routes.json. Loaded only when BM05_RED=1; every test file must then fail.
//   - SITE_URL fallback https://ink.dopelab.studio, trimmed, no validation (site.ts:6-8)
//   - every URL = `${SITE_URL}/${locale}${path}` (seo.ts:19), no basePath; sitemap/feed at the origin root
//   - hreflang always th + en, no x-default (seo.ts:28-31)
//   - OG footer = SITE_URL minus "https://" (api/og/route.tsx:169); og image without basePath (seo.ts:20)
//   - no BLOG_NOINDEX / INK_REDIRECT_MODE: any value is accepted and ignored
const STATIC = { home: "", list: "/all", about: "/about", contact: "/contact" };
const path = (page) =>
  page.kind === "post" ? `/${page.slug}`
    : page.kind === "tag" ? `/tag/${encodeURIComponent(page.value)}`
      : page.kind === "category" ? `/category/${encodeURIComponent(page.value)}`
        : STATIC[page.kind];

export const DEFAULT_SITE_URL = "https://ink.dopelab.studio";
export const resolveSiteUrl = (raw) => ((raw ?? "").trim() || DEFAULT_SITE_URL).replace(/\/+$/, "");
export const SITE_URL = DEFAULT_SITE_URL;

export const resolveNoindex = () => false;
export const resolveRedirectMode = () => undefined;
export const BLOG_NOINDEX = false;
export const INK_REDIRECT_MODE = undefined;
export const INK_CANONICAL = false;

export const routePath = (page) => path(page) || "/";
export const newPath = (page, locale) => `/${locale}${path(page)}`;
export const legacyPath = (page, locale) => `/${locale}${path(page)}`;
export const absoluteUrl = (page, locale, ctx) => `${ctx.siteUrl}/${locale}${path(page)}`;
export const fileUrl = (kind, ctx) => `${ctx.siteUrl}/${kind === "sitemap" ? "sitemap" : "feed"}.xml`;
export const localeSet = () => ["th", "en"];
export const hreflangs = (page, locale, shared, ctx) => ({
  th: `${ctx.siteUrl}/th${path(page)}`,
  en: `${ctx.siteUrl}/en${path(page)}`,
});
export const ogImageUrl = (o, siteUrl) =>
  `${siteUrl}/api/og?title=${encodeURIComponent(o.title)}&locale=${o.locale}` +
  (o.category ? `&category=${encodeURIComponent(o.category)}` : "");
export const coverUrl = (src, siteUrl) => `${siteUrl}${src}`;
export const ogFooterText = (siteUrl) => siteUrl.replace("https://", "");
export const assertSiteUrl = () => {};

// Today there is no legacy map: the canonical is `${SITE_URL}/${locale}<new route>` (BM-04 S-1 shape), no rule ids.
export const legacyRoutes = {
  legacy_origin: DEFAULT_SITE_URL,
  routes: {
    th: { home: "/th", list: "/th/all", about: "/th/about", contact: "/th/contact", post: "/th/:slug", tag: "/th/tag/:tag", category: "/th/category/:cat" },
    en: { home: "/en", list: "/en/all", about: "/en/about", contact: "/en/contact", post: "/en/:slug", tag: "/en/tag/:tag", category: "/en/category/:cat" },
    files: { sitemap: "/sitemap.xml", feed: "/feed.xml" },
  },
};
