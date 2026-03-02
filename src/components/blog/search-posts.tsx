"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";

interface Post {
  slugAsParams: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
}

interface SearchPostsProps {
  posts: Post[];
  onFilter: (filtered: string[]) => void;
}

export function SearchPosts({ posts, onFilter }: SearchPostsProps) {
  const t = useTranslations("blog");
  const [query, setQuery] = useState("");

  function handleChange(value: string) {
    setQuery(value);
    if (!value.trim()) {
      onFilter(posts.map((p) => p.slugAsParams));
      return;
    }
    const q = value.toLowerCase();
    const matched = posts.filter(
      (post) =>
        post.title.toLowerCase().includes(q) ||
        post.description.toLowerCase().includes(q) ||
        post.category.toLowerCase().includes(q) ||
        post.tags.some((tag) => tag.toLowerCase().includes(q))
    );
    onFilter(matched.map((p) => p.slugAsParams));
  }

  return (
    <div className="relative mb-6">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t("search_placeholder")}
        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-10 pr-10 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30"
      />
      {query && (
        <button
          onClick={() => handleChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
