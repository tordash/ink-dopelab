import { getPostsByLocale } from "@/lib/content";
import { SearchButton } from "@/components/blog/search";
import type { Locale } from "@/i18n/routing";

export function SearchProvider({ locale }: { locale: Locale }) {
  const posts = getPostsByLocale(locale);
  const items = posts.map((post) => ({
    title: post.title,
    description: post.description,
    slug: post.slugAsParams,
    category: post.category,
    tags: post.tags,
  }));

  return <SearchButton items={items} />;
}
