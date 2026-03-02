import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Rss } from "lucide-react";

export function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)]">
      <div className="mx-auto max-w-[var(--container-wide)] px-4 py-12 sm:px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/logo-sphere.jpg"
              alt="DopeLab"
              className="h-8 w-8 rounded-lg object-cover"
            />
            <span className="text-lg font-bold font-[family-name:var(--font-typewriter)] text-[var(--color-text-primary)]">
              INK
            </span>
          </Link>

          <p className="max-w-md text-sm text-[var(--color-text-secondary)]">
            {t("tagline")}
          </p>

          <div className="flex items-center gap-4 text-xs text-[var(--color-text-tertiary)]">
            <span>{t("copyright", { year })}</span>
            <span>·</span>
            <span>{t("built_with")}</span>
            <span>·</span>
            <a
              href="/feed.xml"
              className="inline-flex items-center gap-1 transition-colors hover:text-[var(--color-primary)]"
              title="RSS Feed"
            >
              <Rss className="h-3.5 w-3.5" />
              RSS
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
