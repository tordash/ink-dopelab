import type { MetadataRoute } from "next";
import { posts } from "#site/content";
import { getAllCategories, getAllTags } from "@/lib/content";
import { pageUrl } from "@/lib/seo";


export default function sitemap(): MetadataRoute.Sitemap {
  const postUrls = posts
    .filter((post) => !post.draft)
    .map((post) => ({
      url: pageUrl({ kind: "post", slug: post.slugAsParams }, post.locale),
      lastModified: new Date(post.updated || post.date),
      changeFrequency: "weekly" as const,
      priority: post.featured ? 0.9 : 0.7,
    }));

  const categoryUrls = (["th", "en"] as const).flatMap((locale) =>
    getAllCategories(locale).map((cat) => ({
      url: pageUrl({ kind: "category", value: cat }, locale),
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }))
  );

  const tagUrls = (["th", "en"] as const).flatMap((locale) =>
    getAllTags(locale).map((tag) => ({
      url: pageUrl({ kind: "tag", value: tag }, locale),
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }))
  );

  return [
    {
      url: pageUrl({ kind: "home" }, "th"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: pageUrl({ kind: "home" }, "en"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: pageUrl({ kind: "list" }, "th"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: pageUrl({ kind: "list" }, "en"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: pageUrl({ kind: "about" }, "th"),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: pageUrl({ kind: "about" }, "en"),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: pageUrl({ kind: "contact" }, "th"),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: pageUrl({ kind: "contact" }, "en"),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...postUrls,
    ...categoryUrls,
    ...tagUrls,
  ];
}
