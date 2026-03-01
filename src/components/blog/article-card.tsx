import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/utils";
import { Calendar, Clock, ArrowRight } from "lucide-react";

interface ArticleCardProps {
  title: string;
  description: string;
  slug: string;
  date: string;
  category: string;
  tags: string[];
  readingTime: number;
  locale: string;
  cover?: string;
  featured?: boolean;
}

export function ArticleCard({
  title,
  description,
  slug,
  date,
  category,
  readingTime,
  locale,
  featured = false,
}: ArticleCardProps) {
  const t = useTranslations("home");

  if (featured) {
    return (
      <Link
        href={`/blog/${slug}`}
        className="group relative block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-all hover:border-[var(--color-primary)]/30 hover:shadow-lg"
      >
        {/* Featured gradient accent */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--color-primary)] via-[var(--color-secondary)] to-[var(--color-accent)]" />

        <div className="p-6 sm:p-8">
          <div className="mb-3 flex items-center gap-3">
            <span className="rounded-full bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-medium text-[var(--color-primary)]">
              {category}
            </span>
            <span className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
              <Calendar className="h-3 w-3" />
              {formatDate(date, locale)}
            </span>
          </div>

          <h2 className="mb-3 text-xl font-bold leading-snug text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-primary)] sm:text-2xl">
            {title}
          </h2>

          <p className="mb-4 text-sm leading-relaxed text-[var(--color-text-secondary)] line-clamp-3">
            {description}
          </p>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
              <Clock className="h-3 w-3" />
              {readingTime} {t("min_read")}
            </span>
            <span className="flex items-center gap-1 text-sm font-medium text-[var(--color-primary)] transition-transform group-hover:translate-x-1">
              {t("read_more")}
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/blog/${slug}`}
      className="group block overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all hover:border-[var(--color-primary)]/30 hover:shadow-md"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
          {category}
        </span>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {formatDate(date, locale)}
        </span>
      </div>

      <h3 className="mb-2 text-base font-semibold leading-snug text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-primary)]">
        {title}
      </h3>

      <p className="mb-3 text-sm leading-relaxed text-[var(--color-text-secondary)] line-clamp-2">
        {description}
      </p>

      <div className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
        <Clock className="h-3 w-3" />
        {readingTime} {t("min_read")}
      </div>
    </Link>
  );
}
