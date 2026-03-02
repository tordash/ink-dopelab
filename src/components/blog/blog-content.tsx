"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArticleCard, CATEGORY_STYLES } from "./article-card";
import { SearchPosts } from "./search-posts";
import { Link } from "@/i18n/navigation";
import { Hash } from "lucide-react";

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

  const filteredPosts = posts.filter((p) => visibleSlugs.includes(p.slugAsParams));

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

      {filteredPosts.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPosts.map((post) => (
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

      {tags.length > 0 && <TagCloud tags={tags} />}
    </>
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
