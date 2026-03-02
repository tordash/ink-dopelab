import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import {
  getPostsByLocale,
  getAllCategories,
  getAllTags,
} from "@/lib/content";
import { ArticleCard, CATEGORY_STYLES } from "@/components/blog/article-card";
import { createMetadata } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Hash } from "lucide-react";

export async function generateMetadata() {
  const locale = (await getLocale()) as Locale;
  return createMetadata({
    title: locale === "th" ? "บทความทั้งหมด" : "All Articles",
    description:
      locale === "th"
        ? "เรื่องเล่า ประสบการณ์ และ case study จากการใช้ AI ในงานจริง"
        : "Stories, experiences, and case studies from using AI in real work",
    path: "/blog",
    locale,
  });
}

export default async function BlogListPage() {
  const locale = (await getLocale()) as Locale;
  const posts = getPostsByLocale(locale);
  const categories = getAllCategories(locale);
  const tags = getAllTags(locale);

  return (
    <div className="mx-auto max-w-[var(--container-wide)] px-4 py-12 sm:px-6">
      <BlogHeader count={posts.length} />
      <CategoryPills categories={categories} />

      {posts.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <ArticleCard
              key={post.slugAsParams}
              title={post.title}
              description={post.description}
              slug={post.slugAsParams}
              date={post.date}
              category={post.category}
              tags={post.tags}
              readingTime={post.metadata.readingTime}
              locale={locale}
            />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}

      {tags.length > 0 && <TagCloud tags={tags} />}
    </div>
  );
}

function BlogHeader({ count }: { count: number }) {
  const t = useTranslations("blog");
  return (
    <div className="mb-8">
      <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
        {t("title")}
      </h1>
      <p className="text-lg text-[var(--color-text-secondary)] sm:text-xl">
        {t("description")}
        <span className="ml-2 text-base text-[var(--color-text-tertiary)]">
          ({t("post_count", { count })})
        </span>
      </p>
    </div>
  );
}

function CategoryPills({ categories }: { categories: string[] }) {
  const t = useTranslations("blog");
  return (
    <div className="mb-8 flex flex-wrap gap-2">
      <span className="inline-flex items-center rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/10 px-4 py-1.5 text-sm font-semibold text-[var(--color-primary)]">
        {t("all")}
      </span>
      {categories.map((cat) => {
        const style = CATEGORY_STYLES[cat];
        const bg = style?.bg || "#2B4C7E";
        return (
          <Link
            key={cat}
            href={`/blog/category/${encodeURIComponent(cat)}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-4 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)]/40 hover:text-[var(--color-text-primary)]"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: bg }}
            />
            {cat}
          </Link>
        );
      })}
    </div>
  );
}

function TagCloud({ tags }: { tags: string[] }) {
  const t = useTranslations("blog");
  return (
    <div className="mt-16 border-t border-[var(--color-border)] pt-10">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-[var(--color-text-primary)]">
        <Hash className="h-5 w-5 text-[var(--color-primary)]" />
        {t("all_tags")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Link
            key={tag}
            href={`/blog/tag/${encodeURIComponent(tag)}`}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 hover:text-[var(--color-primary)]"
          >
            #{tag}
          </Link>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  const t = useTranslations("blog");
  return (
    <div className="py-20 text-center">
      <p className="text-lg text-[var(--color-text-tertiary)]">
        {t("no_posts")}
      </p>
    </div>
  );
}
