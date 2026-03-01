"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { List } from "lucide-react";

interface TocEntry {
  title: string;
  url: string;
  items: TocEntry[];
}

interface TocProps {
  items: TocEntry[];
}

function flattenToc(items: TocEntry[], depth = 0): { title: string; url: string; depth: number }[] {
  return items.flatMap((item) => [
    { title: item.title, url: item.url, depth },
    ...flattenToc(item.items, depth + 1),
  ]);
}

export function TableOfContents({ items }: TocProps) {
  const t = useTranslations("article");
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-80px 0% -80% 0%" }
    );

    const headings = document.querySelectorAll("article h2, article h3");
    headings.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  if (!items || items.length === 0) return null;

  const flat = flattenToc(items);

  return (
    <nav className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-4">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
        <List className="h-4 w-4" />
        {t("toc")}
      </h4>
      <ul className="space-y-1">
        {flat.map((item) => (
          <li key={item.url}>
            <a
              href={item.url}
              className={cn(
                "block rounded-md px-3 py-1.5 text-sm transition-colors",
                item.depth > 0 && "pl-6",
                activeId === item.url.slice(1)
                  ? "bg-[var(--color-primary)]/10 font-medium text-[var(--color-primary)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              )}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
