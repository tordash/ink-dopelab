"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ArticleCard, CATEGORY_STYLES } from "./article-card";
import { SearchPosts } from "./search-posts";
import { Link } from "@/i18n/navigation";
import { Hash, ChevronLeft, ChevronRight } from "lucide-react";

const POSTS_PER_PAGE = 9;

interface PostData {
  slugAsParams: string;
  title: string;
  description: string;
  date: string;
  category: string;
  tags: string[];
  readingTime: number;
  cover?: {
    src: string;
    width: number;
    height: number;
    blurDataURL: string;
    blurWidth: number;
    blurHeight: number;
  };
}

interface BlogContentProps {
  posts: PostData[];
  categories: string[];
  tags: string[];
  locale: string;
}

export function BlogContent({
  posts,
  categories,
  tags,
  locale,
}: BlogContentProps) {
  const t = useTranslations("blog");
  const allSlugs = posts.map((p) => p.slugAsParams);
  const [visibleSlugs, setVisibleSlugs] = useState<string[]>(allSlugs);
  const [page, setPage] = useState(1);

  const filteredPosts = posts.filter((p) => visibleSlugs.includes(p.slugAsParams));
  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
  const paginatedPosts = filteredPosts.slice(
    (page - 1) * POSTS_PER_PAGE,
    page * POSTS_PER_PAGE
  );

  // Reset page when search results change
  const slugKey = useMemo(() => visibleSlugs.join(","), [visibleSlugs]);
  useEffect(() => {
    setPage(1);
  }, [slugKey]);

  return (
    <>
      <SearchPosts
        posts={posts.map((p) => ({
          slugAsParams: p.slugAsParams,
          title: p.title,
          description: p.description,
          category: p.category,
          tags: p.tags,
        }))}
        onFilter={setVisibleSlugs}
      />

      <CategoryPills categories={categories} />

      {paginatedPosts.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {paginatedPosts.map((post) => (
            <ArticleCard
              key={post.slugAsParams}
              title={post.title}
              description={post.description}
              slug={post.slugAsParams}
              date={post.date}
              category={post.category}
              tags={post.tags}
              readingTime={post.readingTime}
              locale={locale}
              cover={post.cover}
            />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-lg text-[var(--color-text-tertiary)]">
            {t("no_results")}
          </p>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {tags.length > 0 && <TagCloud tags={tags} />}
    </>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const t = useTranslations("blog");

  return (
    <div className="mt-10 flex items-center justify-center gap-2">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("prev_page")}
      </button>

      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
            p === page
              ? "bg-[var(--color-primary)] text-white"
              : "border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]"
          }`}
        >
          {p}
        </button>
      ))}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] disabled:pointer-events-none disabled:opacity-40"
      >
        {t("next_page")}
        <ChevronRight className="h-4 w-4" />
      </button>
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
