import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import { getPostsByLocale } from "@/lib/content";
import { ArticleCard } from "@/components/blog/article-card";
import { createMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";

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

  return (
    <div className="mx-auto max-w-[var(--container-wide)] px-4 py-12 sm:px-6">
      <BlogHeader />

      {posts.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
    </div>
  );
}

function BlogHeader() {
  const t = useTranslations("blog");
  return (
    <div className="mb-10">
      <h1 className="mb-2 text-3xl font-bold text-[var(--color-text-primary)]">
        {t("title")}
      </h1>
      <p className="text-lg text-[var(--color-text-secondary)]">
        {t("description")}
      </p>
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
