// BM-18 (tordash/dopelab-oracle#27): the ONE place that turns a taxonomy key into a display name (SPEC S1, S13).
// Frontmatter and URLs carry the ASCII key; every reader-facing text resolves through categoryName / tagName.
// Separate module on purpose: "use client" files may import it (BM-05 invariants05 4c bans @/lib/seo in them, F-S8).
import data from "@/lib/taxonomy/taxonomy.json";
import { nameOf, visible, type Category, type Locale, type Tag, type Taxonomy } from "./model";

const taxonomy = data as Taxonomy;
const categories: Category[] = taxonomy.categories;
const tags: Tag[] = taxonomy.tags;

/** Category keys in D2 order (pills, sitemap, static params). */
export const categoryOrder: string[] = categories.map((c) => c.key);
/** Tag keys in the controlled-list order. */
export const tagOrder: string[] = tags.map((t) => t.key);

export const isCategoryKey = (key: string): boolean => categoryOrder.includes(key);
export const isTagKey = (key: string): boolean => tagOrder.includes(key);

/** Unknown key → the key itself (never throws at render). */
export const categoryName = (key: string, locale: Locale): string => nameOf(categories, key, locale);
export const tagName = (key: string, locale: Locale): string => nameOf(tags, key, locale);

/** A category with `count` non-draft posts in a locale has a page iff count ≥ its min_posts (studio = 3). */
export function isVisibleCategory(key: string, count: number): boolean {
  const c = categories.find((x) => x.key === key);
  return c ? visible(c, count) : false;
}
