import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getPostBySlug, getPostsByLocale, getRelatedPosts } from "@/lib/content";
import { ArticleBody } from "@/components/blog/article-body";
import { TableOfContents } from "@/components/blog/toc";
import { ArticleCard, CATEGORY_STYLES } from "@/components/blog/article-card";
import { ShareButtons } from "@/components/blog/share-buttons";
import { Comments } from "@/components/blog/comments";
// import { Newsletter } from "@/components/blog/newsletter";
import { createMetadata, articleJsonLd } from "@/lib/seo";
import { formatDate } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { Calendar, Clock, ArrowLeft, Tag } from "lucide-react";
import type { Locale } from "@/i18n/routing";

export async function generateStaticParams() {
  const allPosts = getPostsByLocale("th").concat(getPostsByLocale("en"));
  return allPosts.map((post) => ({
    locale: post.locale,
    slug: post.slugAsParams,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const locale = (await getLocale()) as Locale;
  const { slug } = await params;
  const post = getPostBySlug(slug, locale);
  if (!post) return {};

  const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL || "https://ink.dopelab.studio";
  const coverImage = post.cover
    ? `${SITE_URL}${post.cover.src}`
    : undefined;

  return createMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slugAsParams}`,
    locale,
    type: "article",
    image: coverImage,
  });
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const locale = (await getLocale()) as Locale;
  const { slug } = await params;
  const post = getPostBySlug(slug, locale);

  if (!post) notFound();

  const related = getRelatedPosts(slug, locale);
  const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL || "https://ink.dopelab.studio";

  const articleImage = post.cover
    ? `${SITE_URL}${post.cover.src}`
    : `${SITE_URL}/api/og?title=${encodeURIComponent(post.title)}&locale=${locale}&category=${encodeURIComponent(post.category)}`;

  const jsonLd = articleJsonLd({
    title: post.title,
    description: post.description,
    date: post.date,
    updated: post.updated,
    url: `${SITE_URL}${post.permalink}`,
    image: articleImage,
    locale,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-[var(--container-wide)] px-4 py-8 sm:px-6">
        {/* Back link */}
        <Link
          href="/blog"
          className="mb-6 inline-flex items-center gap-1 text-sm text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {locale === "th" ? "กลับ" : "Back"}
        </Link>

        {/* Cover image */}
        {post.cover && (
          <div className="mx-auto mb-8 max-w-[var(--container-article)] overflow-hidden rounded-2xl">
            <img
              src={post.cover.src}
              alt={post.title}
              loading="eager"
              className="h-auto max-h-[400px] w-full object-cover"
            />
          </div>
        )}

        {/* Article header */}
        <header className="mx-auto mb-12 max-w-[var(--container-article)]">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span
              className="flex items-center gap-1.5 rounded-md bg-[#FFCC00] px-3 py-1 text-xs font-semibold text-[#1A1A1A]"
            >
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: (CATEGORY_STYLES[post.category] || { bg: "#1A1A1A" }).bg }}
              />
              {post.category}
            </span>
            <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-tertiary)]">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(post.date, locale)}
            </span>
            <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-tertiary)]">
              <Clock className="h-3.5 w-3.5" />
              {post.metadata.readingTime}{" "}
              {locale === "th" ? "นาที" : "min read"}
            </span>
          </div>

          <h1 className="mb-5 text-3xl font-extrabold leading-tight tracking-tight text-[var(--color-text-primary)] sm:text-4xl lg:text-5xl">
            {post.title}
          </h1>

          <p className="text-lg leading-relaxed text-[var(--color-text-secondary)] sm:text-xl">
            {post.description}
          </p>

          {/* Author byline */}
          <div className="mt-6 flex items-center gap-3">
            <img
              src="/author-tor.jpg"
              alt="Tor Supakit"
              className="h-10 w-10 rounded-full object-cover"
            />
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                Tor Supakit
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                AI × Digital Marketing Agency
              </p>
            </div>
          </div>
        </header>

        {/* Content + TOC layout */}
        <div className="mx-auto max-w-[var(--container-wide)]">
          <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-10">
            {/* Article body */}
            <div className="mx-auto max-w-[var(--container-article)]">
              <ArticleBody code={post.body} />

              {/* Tags */}
              {post.tags.length > 0 && (
                <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-6">
                  <Tag className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[var(--color-surface-tertiary)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Share buttons */}
              <ShareButtons title={post.title} />
            </div>

            {/* Sidebar TOC (desktop) */}
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <TableOfContents items={post.toc} />
              </div>
            </aside>
          </div>
        </div>

        {/* Newsletter — hidden until backend is ready */}
        {/* <Newsletter /> */}

        {/* Comments */}
        <Comments />

        {/* Related posts */}
        {related.length > 0 && (
          <section className="mx-auto mt-16 max-w-[var(--container-wide)] border-t border-[var(--color-border)] pt-10">
            <div className="mb-8 flex items-center gap-3">
              <div className="h-7 w-1 rounded-full bg-[var(--color-accent)]" />
              <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
                {locale === "th" ? "บทความที่เกี่ยวข้อง" : "Related Articles"}
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((post) => (
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
          </section>
        )}
      </div>
    </>
  );
}
