import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import {
  getPostsByCategory,
  getAllCategories,
} from "@/lib/content";
import { ArticleCard, CATEGORY_STYLES } from "@/components/blog/article-card";
import { createMetadata } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { ChevronRight } from "lucide-react";

export async function generateStaticParams() {
  const params: { locale: string; category: string }[] = [];
  for (const locale of routing.locales) {
    const categories = getAllCategories(locale);
    for (const category of categories) {
      params.push({ locale, category });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; category: string }>;
}) {
  const { locale, category } = await params;
  const decoded = decodeURIComponent(category);
  const posts = getPostsByCategory(decoded, locale as Locale);
  return createMetadata({
    title:
      locale === "th"
        ? `${decoded} — บทความในหมวดนี้`
        : `${decoded} — Articles in this category`,
    description:
      locale === "th"
        ? `${posts.length} บทความในหมวด ${decoded}`
        : `${posts.length} articles in ${decoded}`,
    path: `/blog/category/${category}`,
    locale,
  });
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ locale: string; category: string }>;
}) {
  const { category } = await params;
  const decoded = decodeURIComponent(category);
  const locale = (await getLocale()) as Locale;
  const posts = getPostsByCategory(decoded, locale);

  return (
    <div className="mx-auto max-w-[var(--container-wide)] px-4 py-12 sm:px-6">
      <Breadcrumb category={decoded} />
      <CategoryHeader category={decoded} count={posts.length} />

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

function Breadcrumb({ category }: { category: string }) {
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
        {category}
      </span>
    </nav>
  );
}

function CategoryHeader({
  category,
  count,
}: {
  category: string;
  count: number;
}) {
  const t = useTranslations("blog");
  const style = CATEGORY_STYLES[category];
  const bg = style?.bg || "#2B4C7E";
  const Icon = style?.icon;

  return (
    <div className="mb-10">
      <div className="mb-3 flex items-center gap-3">
        {Icon && (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: bg }}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
        <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
          {category}
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
