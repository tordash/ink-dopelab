import createNextIntlPlugin from "next-intl/plugin";
import { ASSET_PREFIX, BASE_PATH } from "./src/lib/base-path";
import { BLOG_NOINDEX, INK_REDIRECT_MODE } from "./src/lib/seo-env";
import { SITE_URL } from "./src/lib/site";
import { assertSiteUrl } from "./src/lib/urls";
import legacy from "./src/lib/legacy-routes.json";

const withNextIntl = createNextIntlPlugin();

// BM-05: importing seo-env / site validates BLOG_NOINDEX, INK_REDIRECT_MODE and NEXT_PUBLIC_SITE_URL at config load,
// so an unsupported value fails `next build`. S-3: the legacy ink origin is never a valid SITE_URL (the R-b rollback
// uses INK_REDIRECT_MODE=off instead).
assertSiteUrl(SITE_URL, legacy.legacy_origin);

// BM-05 X-Robots-Tag rules (SPEC §3.4), computed at build time into routes-manifest.json. BM-08 appends its host rules
// here instead of adding a second headers() list.
const NOINDEX = [{ key: "X-Robots-Tag", value: "noindex" }];
// Next anchors a `has` host value as new RegExp(`^${value}$`) on the port-less, lower-cased Host header.
const VERCEL_APP_HOST = String.raw`.+\.vercel\.app`;
function xRobotsRules(noindex: boolean) {
  return [
    // REQ D8: BLOG_NOINDEX=1 → every response under the basePath (the source gets the basePath prefix)
    ...(noindex ? [{ source: "/:path*", headers: NOINDEX }] : []),
    // REQ D9 (Helm, ADR-01): the *.vercel.app origin is never indexable, on every path incl. "/" outside the basePath
    { source: "/(.*)", basePath: false as const, has: [{ type: "host" as const, value: VERCEL_APP_HOST }], headers: NOINDEX },
  ];
}

// BM-04: the app lives under BASE_PATH ("/blog"). The 8 old redirect rules (6 legacy slugs + /blog → /th/blog)
// moved to the ink-host redirect layer (url-rules.json, BM-08); under /blog the only 3xx is Next's trailing-slash strip.
// ADR-01 X4: assetPrefix + images.path only when BLOG_ASSET_PREFIX is on (production env, set at Gate 2).
// X4-f: the RESOLVED prefix ("" when off) is inlined into server + client bundles for the raw <img> srcs
// (withAssetHost), so SSR and hydration agree whatever env `next start` gets.
// BM-05: BLOG_NOINDEX / INK_REDIRECT_MODE are inlined RESOLVED the same way (build time only; a runtime env change
// has no effect, REQ D8).
const nextConfig = {
  basePath: BASE_PATH,
  ...(ASSET_PREFIX ? { assetPrefix: ASSET_PREFIX } : {}),
  env: {
    BLOG_BASE_PATH: BASE_PATH,
    BLOG_ASSET_PREFIX: ASSET_PREFIX ?? "",
    BLOG_NOINDEX: BLOG_NOINDEX ? "1" : "0",
    INK_REDIRECT_MODE: INK_REDIRECT_MODE ?? "",
  },
  images: {
    formats: ["image/avif" as const, "image/webp" as const],
    ...(ASSET_PREFIX ? { path: `${ASSET_PREFIX}/_next/image` } : {}),
  },
  async headers() {
    return xRobotsRules(BLOG_NOINDEX);
  },
};

export default withNextIntl(nextConfig);
