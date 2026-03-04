"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import Fuse from "fuse.js";

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

  const fuse = useMemo(
    () =>
      new Fuse(posts, {
        keys: [
          { name: "title", weight: 0.4 },
          { name: "description", weight: 0.3 },
          { name: "category", weight: 0.2 },
          { name: "tags", weight: 0.1 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [posts]
  );

  function handleChange(value: string) {
    setQuery(value);
    if (!value.trim()) {
      onFilter(posts.map((p) => p.slugAsParams));
      return;
    }
    const results = fuse.search(value);
    onFilter(results.map((r) => r.item.slugAsParams));
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
