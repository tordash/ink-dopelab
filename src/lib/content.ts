import { posts } from "#site/content";
import type { Locale } from "@/i18n/routing";

export function getPostsByLocale(locale: Locale) {
  return posts
    .filter((post) => post.locale === locale && !post.draft)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostBySlug(slug: string, locale: Locale) {
  return posts.find(
    (post) => post.slugAsParams === slug && post.locale === locale && !post.draft
  );
}

export function getFeaturedPosts(locale: Locale) {
  return getPostsByLocale(locale).filter((post) => post.featured);
}

export function getPostsByCategory(category: string, locale: Locale) {
  return getPostsByLocale(locale).filter((post) => post.category === category);
}

export function getPostsByTag(tag: string, locale: Locale) {
  return getPostsByLocale(locale).filter((post) => post.tags.includes(tag));
}

export function getAllCategories(locale: Locale) {
  const cats = getPostsByLocale(locale).map((post) => post.category);
  return [...new Set(cats)];
}

export function getAllTags(locale: Locale) {
  const tags = getPostsByLocale(locale).flatMap((post) => post.tags);
  return [...new Set(tags)];
}

export function getRelatedPosts(
  slug: string,
  locale: Locale,
  limit: number = 3
) {
  const current = getPostBySlug(slug, locale);
  if (!current) return [];

  return getPostsByLocale(locale)
    .filter((post) => post.slugAsParams !== slug)
    .map((post) => ({
      post,
      score:
        post.tags.filter((tag) => current.tags.includes(tag)).length * 2 +
        (post.category === current.category ? 3 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ post }) => post);
}
