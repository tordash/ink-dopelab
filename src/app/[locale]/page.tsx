import { useTranslations, useLocale } from "next-intl";
import { getLocale } from "next-intl/server";
import { getPostsByLocale, getFeaturedPosts } from "@/lib/content";
import { ArticleCard } from "@/components/blog/article-card";
import { HeroBackground } from "@/components/hero-background";
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
      <section className="relative overflow-hidden border-b border-[var(--color-border)] bg-[#0a0a0a]">
        {/* Layer 1: Kling 3.0 video background */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50"
        >
          <source src="https://lab.dopelab.studio/dopelab/portfolio/hero-bg.mp4" type="video/mp4" />
        </video>
        {/* Layer 1b: Static fallback */}
        <img
          src="/hero-bg.jpg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30"
        />
        {/* Layer 2: Particle animation */}
        <HeroBackground />
        {/* Layer 3: Overlay for text readability */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 to-black/70" />
        <div className="relative mx-auto max-w-[var(--container-wide)] px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#FFCC00]/30 bg-[#FFCC00]/10 px-5 py-2 text-sm font-medium text-[#FFCC00]">
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
  const locale = useLocale();
  const fontClass =
    locale === "th"
      ? "font-[family-name:var(--font-thai)]"
      : "font-[family-name:var(--font-typewriter)]";

  return (
    <>
      <h1
        className={`mb-6 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl ${fontClass}`}
      >
        {t("hero_subtitle")}
      </h1>
      <p className="mx-auto max-w-2xl text-lg leading-relaxed text-gray-300 sm:text-xl">
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
            cover={post.cover}
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
            cover={post.cover}
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
