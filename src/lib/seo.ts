// BM-05 (SPEC §3.3): the wiring module. It binds the pure URL module (src/lib/urls.ts) to this build's SITE_URL,
// BASE_PATH, redirect mode (INK_CANONICAL), the generated legacy map and the shared-locale index. Every emitter
// (page metadata, JSON-LD, sitemap, feed, robots) asks here; nothing else builds an absolute blog URL.
// Server-only: never import it (or urls.ts / seo-env.ts / legacy-routes.json) from a "use client" file.
// Every value is fixed at build time: no request-time API, so the pages stay static (BM-15).
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { BASE_PATH } from "@/lib/base-path";
import { INK_CANONICAL } from "@/lib/seo-env";
import { getSharedSwitchIndex } from "@/lib/locale-switch";
import legacy from "@/lib/legacy-routes.json";
import {
  absoluteUrl,
  coverUrl,
  fileUrl,
  hreflangs,
  localeSet,
  ogImageUrl,
  type FileKind,
  type Locale,
  type Page,
  type SharedIndex,
  type UrlCtx,
} from "@/lib/urls";

/** Byte-equal to the layout strings before BM-05 (REQ D14: no <title>/description change). */
export const SITE_TITLE = "INK by DopeLab — AI × Digital Marketing Blog";
export const SITE_DESCRIPTION =
  "บล็อกเกี่ยวกับ AI, Digital Marketing, และ Business Automation จากประสบการณ์จริง";

const OG_LOCALE: Record<Locale, string> = { th: "th_TH", en: "en_US" };

export const URL_CTX: UrlCtx = { siteUrl: SITE_URL, basePath: BASE_PATH, inkCanonical: INK_CANONICAL, legacy };

let shared: SharedIndex | undefined;
const sharedIndex = () => (shared ??= getSharedSwitchIndex()); // built once per worker

/** canonical = og:url = JSON-LD url = sitemap <loc> = feed link of a page (normal: new host; mode off: ink). */
export const pageUrl = (page: Page, locale: Locale) => absoluteUrl(page, locale, URL_CTX);
/** The sitemap / feed URL of this build's mode (robots Sitemap:, feed atom:link self). */
export const blogFileUrl = (kind: FileKind) => fileUrl(kind, URL_CTX);
/** The generated OG image, always on SITE_URL + basePath (never the asset host, never ink: D4, ADR-01 09). */
export const ogImage = (o: { title: string; locale: Locale; category?: string }) => ogImageUrl(o, SITE_URL, BASE_PATH);
/** A post's og:image / twitter:image / JSON-LD image: its cover, else the generated image with its category. */
export const postImage = (p: { title: string; locale: Locale; category: string; cover?: { src: string } }) =>
  p.cover ? coverUrl(p.cover.src, SITE_URL) : ogImage({ title: p.title, locale: p.locale, category: p.category });

/**
 * Page metadata: canonical + og:url from pageUrl, hreflang only when the page exists in both locales (th, en,
 * x-default = th; REQ D6), og:locale:alternate on the same pages. Without title/description (the home page) it keeps
 * the layout's exact <title> (absolute, so the "%s | INK by DopeLab" template does not wrap it) and description.
 */
export function createMetadata({
  title,
  description,
  page,
  locale,
  image,
  type = "website",
}: {
  title?: string;
  description?: string;
  page: Page;
  locale: Locale;
  image?: string;
  type?: "website" | "article";
}): Metadata {
  const url = pageUrl(page, locale);
  const languages = hreflangs(page, locale, sharedIndex(), URL_CTX);
  const paired = localeSet(page, locale, sharedIndex()).length === 2;
  const ogTitle = title ?? SITE_TITLE;
  const ogDescription = description ?? SITE_DESCRIPTION;
  const img = image || ogImage({ title: ogTitle, locale });

  return {
    ...(title === undefined
      ? { title: { absolute: SITE_TITLE }, description: SITE_DESCRIPTION }
      : { title, description }),
    alternates: {
      canonical: url,
      ...(languages ? { languages } : {}),
    },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url,
      siteName: "INK by DopeLab",
      locale: OG_LOCALE[locale],
      ...(paired ? { alternateLocale: OG_LOCALE[locale === "th" ? "en" : "th"] } : {}),
      type,
      images: [{ url: img, width: 1200, height: 630, alt: ogTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [img],
    },
  };
}

export function articleJsonLd({
  title,
  description,
  date,
  updated,
  url,
  image,
  locale,
}: {
  title: string;
  description: string;
  date: string;
  updated?: string;
  url: string;
  image?: string;
  locale: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished: date,
    dateModified: updated || date,
    url,
    inLanguage: locale === "th" ? "th-TH" : "en-US",
    image: image || ogImage({ title, locale: locale === "en" ? "en" : "th" }),
    author: {
      "@type": "Organization",
      name: "DopeLab Studio",
      url: "https://dopelab.studio",
    },
    publisher: {
      "@type": "Organization",
      name: "DopeLab Studio",
      url: "https://dopelab.studio",
    },
  };
}
