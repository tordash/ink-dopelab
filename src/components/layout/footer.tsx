import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Pen } from "lucide-react";

export function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)]">
      <div className="mx-auto max-w-[var(--container-wide)] px-4 py-12 sm:px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white">
              <Pen className="h-3.5 w-3.5" />
            </div>
            <span className="text-lg font-bold text-[var(--color-text-primary)]">
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
          </div>
        </div>
      </div>
    </footer>
  );
}
