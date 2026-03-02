import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import { getPostsByTag, getAllTags } from "@/lib/content";
import { ArticleCard } from "@/components/blog/article-card";
import { createMetadata } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { ChevronRight, Hash } from "lucide-react";

export async function generateStaticParams() {
  const params: { locale: string; tag: string }[] = [];
  for (const locale of routing.locales) {
    const tags = getAllTags(locale);
    for (const tag of tags) {
      params.push({ locale, tag });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; tag: string }>;
}) {
  const { locale, tag } = await params;
  const decoded = decodeURIComponent(tag);
  const posts = getPostsByTag(decoded, locale as Locale);
  return createMetadata({
    title:
      locale === "th"
        ? `#${decoded} — บทความที่แท็กนี้`
        : `#${decoded} — Tagged articles`,
    description:
      locale === "th"
        ? `${posts.length} บทความที่แท็ก #${decoded}`
        : `${posts.length} articles tagged #${decoded}`,
    path: `/blog/tag/${tag}`,
    locale,
  });
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ locale: string; tag: string }>;
}) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  const locale = (await getLocale()) as Locale;
  const posts = getPostsByTag(decoded, locale);

  return (
    <div className="mx-auto max-w-[var(--container-wide)] px-4 py-12 sm:px-6">
      <Breadcrumb tag={decoded} />
      <TagHeader tag={decoded} count={posts.length} />

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
        <NoResults />
      )}
    </div>
  );
}

function Breadcrumb({ tag }: { tag: string }) {
  const t = useTranslations("blog");
  return (
    <nav className="mb-6 flex items-center gap-1.5 text-sm text-[var(--color-text-tertiary)]">
      <Link
        href="/blog"
        className="hover:text-[var(--color-primary)] transition-colors"
      >
        {t("title")}
      </Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="text-[var(--color-text-primary)] font-medium">
        #{tag}
      </span>
    </nav>
  );
}

function TagHeader({ tag, count }: { tag: string; count: number }) {
  const t = useTranslations("blog");
  return (
    <div className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <Hash className="h-8 w-8 text-[var(--color-primary)]" />
        <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
          {tag}
        </h1>
      </div>
      <p className="text-[var(--color-text-secondary)]">
        {t("post_count", { count })}
      </p>
    </div>
  );
}

function NoResults() {
  const t = useTranslations("blog");
  return (
    <div className="py-20 text-center">
      <p className="text-lg text-[var(--color-text-tertiary)]">
        {t("no_results")}
      </p>
    </div>
  );
}
