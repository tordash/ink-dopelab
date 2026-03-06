import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["th", "en"],
  defaultLocale: "th",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
