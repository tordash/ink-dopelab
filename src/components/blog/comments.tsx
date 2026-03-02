"use client";

import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import GiscusComponent from "@giscus/react";

export function Comments() {
  const { resolvedTheme } = useTheme();
  const locale = useLocale();
  const t = useTranslations("article");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <section className="mx-auto mt-12 max-w-[var(--container-article)] border-t border-[var(--color-border)] pt-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-7 w-1 rounded-full bg-[var(--color-accent)]" />
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
          {t("comments")}
        </h2>
      </div>
      <GiscusComponent
        repo="tordash/ink-dopelab"
        repoId="R_kgDORb6CeA"
        category="General"
        categoryId="DIC_kwDORb6CeM4C3g6r"
        mapping="pathname"
        reactionsEnabled="1"
        emitMetadata="0"
        inputPosition="top"
        theme={resolvedTheme === "dark" ? "dark_dimmed" : "light"}
        lang={locale === "th" ? "th" : "en"}
      />
    </section>
  );
}
