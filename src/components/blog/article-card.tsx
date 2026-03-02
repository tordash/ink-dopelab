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

export const CATEGORY_STYLES: Record<
  string,
  { bg: string; bgDark: string; text: string; textDark: string; icon: LucideIcon }
> = {
  "AI Workflow": {
    bg: "#1A1A1A",
    bgDark: "#FFCC00",
    text: "#FFFFFF",
    textDark: "#1A1A1A",
    icon: Cpu,
  },
  "Developer Tools": {
    bg: "#333333",
    bgDark: "#8AB4F8",
    text: "#FFFFFF",
    textDark: "#1A1A1A",
    icon: Terminal,
  },
  "Agency Tools": {
    bg: "#D4AA00",
    bgDark: "#FFD740",
    text: "#FFFFFF",
    textDark: "#1A1A1A",
    icon: BarChart3,
  },
  "AI for Restaurant": {
    bg: "#8B4513",
    bgDark: "#D4915A",
    text: "#FFFFFF",
    textDark: "#1A1A1A",
    icon: UtensilsCrossed,
  },
  "AI Content": {
    bg: "#555555",
    bgDark: "#B0B0B0",
    text: "#FFFFFF",
    textDark: "#1A1A1A",
    icon: Palette,
  },
};

const DEFAULT_STYLE = {
  bg: "#1A1A1A",
  bgDark: "#FFCC00",
  text: "#FFFFFF",
  textDark: "#1A1A1A",
  icon: Pen,
};

function getCategoryStyle(category: string) {
  return CATEGORY_STYLES[category] || DEFAULT_STYLE;
}

/**
 * Shared CSS for category-colored elements.
 * Uses CSS custom properties (--cat-bg, --cat-bg-dark, etc.) set per-card via inline style.
 * Dark mode switches via the .dark class (next-themes).
 */
const CATEGORY_CSS = `
  .cat-strip {
    background-color: var(--cat-bg);
  }
  .dark .cat-strip {
    background-color: var(--cat-bg-dark);
  }
  .cat-pill {
    background-color: var(--cat-bg);
    color: var(--cat-text);
  }
  .dark .cat-pill {
    background-color: var(--cat-bg-dark);
    color: var(--cat-text-dark);
  }
  .cat-header {
    background-color: var(--cat-bg);
  }
  .dark .cat-header {
    background-color: var(--cat-bg-dark);
  }
  .cat-header-content {
    color: rgba(255, 255, 255, 0.9);
  }
  .dark .cat-header-content {
    color: var(--cat-text-dark);
  }
  .cat-header-icon {
    color: rgba(255, 255, 255, 0.8);
  }
  .dark .cat-header-icon {
    color: var(--cat-text-dark);
    opacity: 0.8;
  }
  .cat-top-bar {
    background-color: var(--cat-bg);
  }
  .dark .cat-top-bar {
    background-color: var(--cat-bg-dark);
  }
`;

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

  // CSS custom properties for per-card category colors (cascade to child .cat-* elements)
  const cardCssVars = {
    "--cat-bg": style.bg,
    "--cat-bg-dark": style.bgDark,
    "--cat-text": style.text,
    "--cat-text-dark": style.textDark,
  } as React.CSSProperties;

  if (featured) {
    return (
      <Link
        href={`/blog/${slug}`}
        className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-200 hover:border-[var(--color-primary)]/40 hover:shadow-xl hover:shadow-[var(--color-primary)]/5"
        style={cardCssVars}
      >
        <style>{CATEGORY_CSS}</style>

        {/* Category color accent — left strip (4px) */}
        <div className="absolute left-0 top-0 z-10 h-full w-1 rounded-l-2xl cat-strip" />

        {/* Cover image or category color block */}
        {cover ? (
          <div className="relative aspect-[16/9] max-h-[360px] overflow-hidden">
            <img
              src={cover.src}
              alt={title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {/* Category pill overlaid on image */}
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold shadow-sm cat-pill">
              <Icon className="h-3.5 w-3.5" />
              {category}
            </span>
          </div>
        ) : (
          <div className="flex h-20 items-center gap-3 px-6 cat-header">
            <Icon className="h-7 w-7 cat-header-icon" />
            <span className="text-sm font-semibold cat-header-content">
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
      className="group relative flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-200 hover:border-[var(--color-primary)]/30 hover:shadow-lg hover:shadow-[var(--color-primary)]/5"
      style={cardCssVars}
    >
      <style>{CATEGORY_CSS}</style>

      {/* Category color accent — left strip (4px) */}
      <div className="absolute left-0 top-0 z-10 h-full w-1 rounded-l-xl cat-strip" />

      {/* Cover image or category color top bar */}
      {cover ? (
        <div className="relative aspect-[16/9] max-h-[280px] overflow-hidden">
          <img
            src={cover.src}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {/* Category pill overlaid on image */}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold shadow-sm cat-pill">
            <Icon className="h-3.5 w-3.5" />
            {category}
          </span>
        </div>
      ) : (
        <div className="h-2 cat-top-bar" />
      )}

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        {/* Meta row */}
        <div className="mb-3 flex items-center gap-2">
          {/* Category pill (always visible — when cover exists it's on the image, otherwise inline here) */}
          {!cover && (
            <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-xs font-semibold cat-pill">
              <Icon className="h-3 w-3" />
              {category}
            </span>
          )}
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
