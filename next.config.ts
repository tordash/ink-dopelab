import createNextIntlPlugin from "next-intl/plugin";
import { ASSET_PREFIX, BASE_PATH } from "./src/lib/base-path";

const withNextIntl = createNextIntlPlugin();

// BM-04: the app lives under BASE_PATH ("/blog"). The 8 old redirect rules (6 legacy slugs + /blog → /th/blog)
// moved to the ink-host redirect layer (url-rules.json, BM-08); under /blog the only 3xx is Next's trailing-slash strip.
// ADR-01 X4: assetPrefix + images.path only when BLOG_ASSET_PREFIX is on (production env, set at Gate 2).
// X4-f: the RESOLVED prefix ("" when off) is inlined into server + client bundles for the raw <img> srcs
// (withAssetHost), so SSR and hydration agree whatever env `next start` gets.
const nextConfig = {
  basePath: BASE_PATH,
  ...(ASSET_PREFIX ? { assetPrefix: ASSET_PREFIX } : {}),
  env: { BLOG_BASE_PATH: BASE_PATH, BLOG_ASSET_PREFIX: ASSET_PREFIX ?? "" },
  images: {
    formats: ["image/avif" as const, "image/webp" as const],
    ...(ASSET_PREFIX ? { path: `${ASSET_PREFIX}/_next/image` } : {}),
  },
};

export default withNextIntl(nextConfig);
