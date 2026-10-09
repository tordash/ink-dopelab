import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["th", "en"],
  defaultLocale: "th",
  localeDetection: false,
  // BM-04 (U1): th has no prefix (/blog/<slug>), en is /blog/en/<slug>
  localePrefix: "as-needed",
  // BM-15: no NEXT_LOCALE Set-Cookie (0 readers, detection off) → page/RSC responses stay CDN-cacheable
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];
