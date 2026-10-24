import { getPostsByLocale } from "@/lib/content";
import { SearchButton } from "@/components/blog/search";
import type { Locale } from "@/i18n/routing";
import { searchNames } from "@/lib/taxonomy";

export function SearchProvider({ locale }: { locale: Locale }) {
  const posts = getPostsByLocale(locale);
  const items = posts.map((post) => ({
    title: post.title,
    description: post.description,
    slug: post.slugAsParams,
    ...searchNames(post.category, post.tags, locale), // BM-18: users search by the name they read
  }));

  return <SearchButton items={items} />;
}
