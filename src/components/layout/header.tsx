"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ThemeToggle } from "./theme-toggle";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileNav } from "./mobile-nav";
import { Pen } from "lucide-react";

export function Header() {
  const t = useTranslations("nav");

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-[var(--container-wide)] items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white transition-transform group-hover:scale-105">
            <Pen className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-[family-name:var(--font-typewriter)] text-xl leading-tight tracking-wide text-[var(--color-text-primary)]">
              INK
            </span>
            <span className="text-[10px] font-medium leading-none text-[var(--color-text-tertiary)]">
              by DopeLab
            </span>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            {t("home")}
          </Link>
          <Link
            href="/blog"
            className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            {t("blog")}
          </Link>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
