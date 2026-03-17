"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Fuse from "fuse.js";
import { Search as SearchIcon, X } from "lucide-react";

interface SearchItem {
  title: string;
  description: string;
  slug: string;
  category: string;
  tags: string[];
}

export function SearchButton({ items }: { items: SearchItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("search");

  const fuse = useRef(
    new Fuse(items, {
      keys: [
        { name: "title", weight: 3 },
        { name: "description", weight: 2 },
        { name: "category", weight: 1 },
        { name: "tags", weight: 1 },
      ],
      threshold: 0.4,
      includeScore: true,
    })
  );

  useEffect(() => {
    fuse.current = new Fuse(items, {
      keys: [
        { name: "title", weight: 3 },
        { name: "description", weight: 2 },
        { name: "category", weight: 1 },
        { name: "tags", weight: 1 },
      ],
      threshold: 0.4,
      includeScore: true,
    });
  }, [items]);

  const results = query.length >= 2 ? fuse.current.search(query).slice(0, 5) : [];

  const handleOpen = useCallback(() => {
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const handleSelect = useCallback(
    (slug: string) => {
      handleClose();
      router.push(`/blog/${slug}`);
    },
    [handleClose, router]
  );

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) handleClose();
        else handleOpen();
      }
      if (e.key === "Escape" && open) handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleOpen, handleClose]);

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-tertiary)] transition-colors hover:border-[var(--color-primary)]/40 hover:text-[var(--color-text-secondary)]"
        aria-label={t("placeholder")}
      >
        <SearchIcon className="h-4 w-4" />
        <span className="hidden sm:inline">{t("placeholder")}</span>
        <kbd className="hidden rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] font-medium sm:inline">
          ⌘K
        </kbd>
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm"
          onClick={handleClose}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input */}
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
              <SearchIcon className="h-5 w-5 shrink-0 text-[var(--color-text-tertiary)]" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("placeholder")}
                className="flex-1 bg-transparent text-base text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
              />
              <button onClick={handleClose} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto">
              {query.length >= 2 && results.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-[var(--color-text-tertiary)]">
                  {t("no_results")}
                </p>
              )}
              {results.map(({ item }) => (
                <button
                  key={item.slug}
                  onClick={() => handleSelect(item.slug)}
                  className="flex w-full flex-col gap-1 border-b border-[var(--color-border-light)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-secondary)]"
                >
                  <span className="text-xs font-medium text-[var(--color-accent)]">
                    {item.category}
                  </span>
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {item.title}
                  </span>
                  <span className="line-clamp-1 text-xs text-[var(--color-text-tertiary)]">
                    {item.description}
                  </span>
                </button>
              ))}
            </div>

            {/* Footer hint */}
            <div className="border-t border-[var(--color-border)] px-4 py-2 text-[11px] text-[var(--color-text-tertiary)]">
              ESC {t("to_close")} · ↵ {t("to_select")}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
