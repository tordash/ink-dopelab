"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { getPathname, usePathname } from "@/i18n/navigation";
import { Globe } from "lucide-react";
import { counterpartPath, type SwitchIndex } from "@/lib/routes";

export function LocaleSwitcher({ switchIndex }: { switchIndex: SwitchIndex }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("nav");

  // BM-04 (U1): go to the same page in the other locale when it exists there, else to that locale's home.
  // Not next-intl's router.replace(href, { locale }): it forces a locale prefix on locale changes
  // (navigation/react-client/createNavigation.js `forcePrefix`), i.e. /blog/th/…, which is a 404 under U1.
  // getPathname without forcePrefix gives the as-needed path (th: none, en: /en); Next's router adds the basePath.
  const switchLocale = () => {
    const next = locale === "th" ? "en" : "th";
    router.replace(getPathname({ href: counterpartPath(pathname, switchIndex), locale: next }));
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
