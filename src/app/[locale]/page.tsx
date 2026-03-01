import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import { getPostsByLocale, getFeaturedPosts } from "@/lib/content";
import { ArticleCard } from "@/components/blog/article-card";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Locale } from "@/i18n/routing";

export default async function HomePage() {
  const locale = (await getLocale()) as Locale;
  const allPosts = getPostsByLocale(locale);
  const featured = getFeaturedPosts(locale);
  const latest = allPosts.filter((p) => !p.featured).slice(0, 6);

  return (
    <div className="mx-auto max-w-[var(--container-wide)] px-4 py-12 sm:px-6">
      {/* Hero */}
      <section className="mb-16 text-center">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)]/10 px-4 py-1.5 text-sm font-medium text-[var(--color-primary)]">
            <Sparkles className="h-4 w-4" />
            <HeroTitle />
          </div>
          <HeroContent />
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="mb-16">
          <FeaturedSection posts={featured} locale={locale} />
        </section>
      )}

      {/* Latest */}
      {latest.length > 0 && (
        <section>
          <LatestSection posts={latest} locale={locale} />
        </section>
      )}

      {/* Empty state */}
      {allPosts.length === 0 && <EmptyState />}
    </div>
  );
}

function HeroTitle() {
  const t = useTranslations("home");
  return <span>{t("hero_title")}</span>;
}

function HeroContent() {
  const t = useTranslations("home");
  return (
    <>
      <h1 className="mb-4 text-4xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-5xl">
        {t("hero_subtitle")}
      </h1>
      <p className="text-lg leading-relaxed text-[var(--color-text-secondary)]">
        {t("hero_description")}
      </p>
    </>
  );
}

function FeaturedSection({
  posts,
  locale,
}: {
  posts: ReturnType<typeof getFeaturedPosts>;
  locale: string;
}) {
  const t = useTranslations("home");
  return (
    <>
      <h2 className="mb-6 text-lg font-semibold text-[var(--color-text-primary)]">
        {t("featured")}
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
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
            featured
          />
        ))}
      </div>
    </>
  );
}

function LatestSection({
  posts,
  locale,
}: {
  posts: ReturnType<typeof getPostsByLocale>;
  locale: string;
}) {
  const t = useTranslations("home");
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          {t("latest")}
        </h2>
        <Link
          href="/blog"
          className="flex items-center gap-1 text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          {t("view_all")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
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
    </>
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
