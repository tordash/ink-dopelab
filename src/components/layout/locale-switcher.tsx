"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Globe } from "lucide-react";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("nav");

  const switchLocale = () => {
    const next = locale === "th" ? "en" : "th";
    router.replace(pathname, { locale: next });
  };

  return (
    <button
      onClick={switchLocale}
      className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
      aria-label="Switch language"
    >
      <Globe className="h-4 w-4" />
      <span className="hidden sm:inline">{t("language")}</span>
    </button>
  );
}
