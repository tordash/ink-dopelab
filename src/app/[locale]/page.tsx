import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import { getPostsByLocale, getFeaturedPosts } from "@/lib/content";
import { ArticleCard } from "@/components/blog/article-card";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Pen } from "lucide-react";
import type { Locale } from "@/i18n/routing";

export default async function HomePage() {
  const locale = (await getLocale()) as Locale;
  const allPosts = getPostsByLocale(locale);
  const featured = getFeaturedPosts(locale);
  const latest = allPosts.filter((p) => !p.featured).slice(0, 6);

  return (
    <>
      {/* Hero */}
      <section className="border-b border-[var(--color-border)] bg-gradient-to-b from-[var(--color-surface)] to-[var(--color-surface-secondary)]">
        <div className="mx-auto max-w-[var(--container-wide)] px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-5 py-2 text-sm font-medium text-[var(--color-primary)]">
              <Pen className="h-4 w-4" />
              <HeroBadge />
            </div>
            <HeroContent />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[var(--container-wide)] px-4 sm:px-6">
        {/* Featured */}
        {featured.length > 0 && (
          <section className="py-12 sm:py-16">
            <FeaturedSection posts={featured} locale={locale} />
          </section>
        )}

        {/* Latest */}
        {latest.length > 0 && (
          <section className="border-t border-[var(--color-border)] py-12 sm:py-16">
            <LatestSection posts={latest} locale={locale} />
          </section>
        )}

        {/* Empty state */}
        {allPosts.length === 0 && <EmptyState />}
      </div>
    </>
  );
}

function HeroBadge() {
  const t = useTranslations("home");
  return <span>{t("hero_title")}</span>;
}

function HeroContent() {
  const t = useTranslations("home");
  return (
    <>
      <h1 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight text-[var(--color-text-primary)] sm:text-5xl lg:text-6xl">
        {t("hero_subtitle")}
      </h1>
      <p className="mx-auto max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)] sm:text-xl">
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
      <div className="mb-8 flex items-center gap-3">
        <div className="h-8 w-1 rounded-full bg-[var(--color-secondary)]" />
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          {t("featured")}
        </h2>
      </div>
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
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-[var(--color-accent)]" />
          <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
            {t("latest")}
          </h2>
        </div>
        <Link
          href="/blog"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          {t("view_all")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
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
