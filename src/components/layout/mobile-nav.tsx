"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Menu, X } from "lucide-react";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)]"
        aria-label="Menu"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-16 border-b border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg">
          <nav className="flex flex-col gap-1">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)]"
            >
              {t("home")}
            </Link>
            <Link
              href="/blog"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)]"
            >
              {t("blog")}
            </Link>
            <Link
              href="/about"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)]"
            >
              {t("about")}
            </Link>
            <Link
              href="/contact"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)]"
            >
              {t("contact")}
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}
