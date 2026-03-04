import type { MetadataRoute } from "next";
import { posts } from "#site/content";
import { getAllCategories, getAllTags } from "@/lib/content";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://ink.dopelab.studio";

export default function sitemap(): MetadataRoute.Sitemap {
  const postUrls = posts
    .filter((post) => !post.draft)
    .map((post) => ({
      url: `${SITE_URL}${post.permalink}`,
      lastModified: new Date(post.updated || post.date),
      changeFrequency: "weekly" as const,
      priority: post.featured ? 0.9 : 0.7,
    }));

  const categoryUrls = (["th", "en"] as const).flatMap((locale) =>
    getAllCategories(locale).map((cat) => ({
      url: `${SITE_URL}/${locale}/blog/category/${encodeURIComponent(cat)}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }))
  );

  const tagUrls = (["th", "en"] as const).flatMap((locale) =>
    getAllTags(locale).map((tag) => ({
      url: `${SITE_URL}/${locale}/blog/tag/${encodeURIComponent(tag)}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }))
  );

  return [
    {
      url: `${SITE_URL}/th`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/en`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/th/blog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/en/blog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/th/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/en/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/th/contact`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/en/contact`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...postUrls,
    ...categoryUrls,
    ...tagUrls,
  ];
}
