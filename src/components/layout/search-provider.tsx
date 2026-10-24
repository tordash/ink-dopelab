import { getPostsByLocale } from "@/lib/content";
import { SearchButton } from "@/components/blog/search";
import type { Locale } from "@/i18n/routing";
import { categoryName, tagName } from "@/lib/taxonomy";

export function SearchProvider({ locale }: { locale: Locale }) {
  const posts = getPostsByLocale(locale);
  const items = posts.map((post) => ({
    title: post.title,
    description: post.description,
    slug: post.slugAsParams,
    category: categoryName(post.category, locale), // BM-18: users search by the name they read
    tags: post.tags.map((tag) => tagName(tag, locale)),
  }));

  return <SearchButton items={items} />;
}
