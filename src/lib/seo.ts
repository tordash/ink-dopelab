import type { Metadata } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ink.dopelab.studio";

export function createMetadata({
  title,
  description,
  path = "",
  locale = "th",
  image,
  type = "website",
}: {
  title: string;
  description: string;
  path?: string;
  locale?: string;
  image?: string;
  type?: "website" | "article";
}): Metadata {
  const url = `${SITE_URL}/${locale}${path}`;
  const ogImage = image || `${SITE_URL}/api/og?title=${encodeURIComponent(title)}&locale=${locale}`;
  const altLocale = locale === "th" ? "en" : "th";

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        th: `${SITE_URL}/th${path}`,
        en: `${SITE_URL}/en${path}`,
      },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "INK by DopeLab",
      locale: locale === "th" ? "th_TH" : "en_US",
      alternateLocale: altLocale === "th" ? "th_TH" : "en_US",
      type,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
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
    image: image || undefined,
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
