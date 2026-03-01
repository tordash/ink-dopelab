import type { MetadataRoute } from "next";
import { posts } from "#site/content";

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
    ...postUrls,
  ];
}
