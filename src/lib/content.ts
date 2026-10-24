import { posts } from "#site/content";
import type { Locale } from "@/i18n/routing";
import { categoryOrder, isVisibleCategory, tagOrder } from "@/lib/taxonomy";

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

/** BM-18 (S2): visible category keys of a locale (non-draft posts ≥ min_posts; studio hidden below 3), D2 order. */
export function getAllCategories(locale: Locale) {
  const cats = getPostsByLocale(locale).map((post) => post.category);
  return categoryOrder.filter((key) => isVisibleCategory(key, cats.filter((c) => c === key).length));
}

/** BM-18: tag keys that have a post in the locale, in the controlled-list order. */
export function getAllTags(locale: Locale) {
  const tags = new Set(getPostsByLocale(locale).flatMap((post) => post.tags));
  return tagOrder.filter((key) => tags.has(key));
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
