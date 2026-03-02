import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/utils";
import {
  Calendar,
  Clock,
  ArrowRight,
  Cpu,
  Terminal,
  BarChart3,
  UtensilsCrossed,
  Palette,
  Pen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface CoverImage {
  src: string;
  width: number;
  height: number;
  blurDataURL: string;
  blurWidth: number;
  blurHeight: number;
}

interface ArticleCardProps {
  title: string;
  description: string;
  slug: string;
  date: string;
  category: string;
  tags: string[];
  readingTime: number;
  locale: string;
  cover?: CoverImage;
  featured?: boolean;
}

export const CATEGORY_STYLES: Record<string, { bg: string; icon: LucideIcon }> = {
  "AI Workflow": { bg: "#2B4C7E", icon: Cpu },
  "Developer Tools": { bg: "#27AE60", icon: Terminal },
  "Agency Tools": { bg: "#F39C12", icon: BarChart3 },
  "AI for Restaurant": { bg: "#C0392B", icon: UtensilsCrossed },
  "AI Content": { bg: "#8E44AD", icon: Palette },
};

function getCategoryStyle(category: string) {
  return CATEGORY_STYLES[category] || { bg: "#2B4C7E", icon: Pen };
}

export function ArticleCard({
  title,
  description,
  slug,
  date,
  category,
  readingTime,
  locale,
  cover,
  featured = false,
}: ArticleCardProps) {
  const t = useTranslations("home");
  const style = getCategoryStyle(category);
  const Icon = style.icon;

  if (featured) {
    return (
      <Link
        href={`/blog/${slug}`}
        className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-200 hover:border-[var(--color-primary)]/40 hover:shadow-xl hover:shadow-[var(--color-primary)]/5"
      >
        {/* Cover image or category color block */}
        {cover ? (
          <div className="relative aspect-[16/9] overflow-hidden">
            <img
              src={cover.src}
              alt={title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <span
              className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold text-white shadow-sm"
              style={{ backgroundColor: style.bg }}
            >
              <Icon className="h-3.5 w-3.5" />
              {category}
            </span>
          </div>
        ) : (
          <div
            className="flex h-20 items-center gap-3 px-6"
            style={{ backgroundColor: style.bg }}
          >
            <Icon className="h-7 w-7 text-white/80" />
            <span className="text-sm font-semibold text-white/90">
              {category}
            </span>
          </div>
        )}

        <div className="flex flex-1 flex-col p-6 sm:p-8">
          {/* Meta row */}
          <div className="mb-4 flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
              <Calendar className="h-3 w-3" />
              {formatDate(date, locale)}
            </span>
          </div>

          {/* Title */}
          <h3 className="mb-3 text-xl font-bold leading-snug text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-primary)] sm:text-2xl">
            {title}
          </h3>

          {/* Description */}
          <p className="mb-6 flex-1 text-sm leading-relaxed text-[var(--color-text-secondary)] line-clamp-3 sm:text-base">
            {description}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[var(--color-border-light)] pt-4">
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
              <Clock className="h-3.5 w-3.5" />
              {readingTime} {t("min_read")}
            </span>
            <span className="flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)] transition-transform group-hover:translate-x-1">
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
      className="group flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-200 hover:border-[var(--color-primary)]/30 hover:shadow-lg hover:shadow-[var(--color-primary)]/5"
    >
      {/* Cover image or category color strip */}
      {cover ? (
        <div className="relative h-40 overflow-hidden">
          <img
            src={cover.src}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="h-10" style={{ backgroundColor: style.bg }} />
      )}

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        {/* Meta row */}
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-md bg-[var(--color-surface-tertiary)] px-2 py-0.5 text-xs font-semibold text-[var(--color-text-secondary)]">
            {category}
          </span>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {formatDate(date, locale)}
          </span>
        </div>

        {/* Title */}
        <h3 className="mb-2 text-base font-bold leading-snug text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-primary)] sm:text-lg">
          {title}
        </h3>

        {/* Description */}
        <p className="mb-4 flex-1 text-sm leading-relaxed text-[var(--color-text-secondary)] line-clamp-2">
          {description}
        </p>

        {/* Footer */}
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
          <Clock className="h-3.5 w-3.5" />
          {readingTime} {t("min_read")}
        </div>
      </div>
    </Link>
  );
}
