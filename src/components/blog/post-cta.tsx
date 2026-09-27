"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, MessageCircle } from "lucide-react";

const LINE_URL = "https://lin.ee/zV8EwXv";
const STUDIO_URL = "https://dopelab.studio";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function withUtm(base: string, slug: string) {
  const params = new URLSearchParams({
    utm_source: "ink",
    utm_medium: "post_cta",
    utm_campaign: slug,
  });
  return `${base}?${params.toString()}`;
}

export function PostCta({ slug }: { slug: string }) {
  const t = useTranslations("article");

  const trackLineClick = () => {
    window.gtag?.("event", "line_click", { location: "post_cta", post: slug });
  };

  return (
    <aside className="mt-10 rounded-2xl bg-gradient-to-br from-[#1A1A1A] to-[#000000] p-6 text-white sm:p-8">
      <h2 className="mb-2 text-xl font-bold sm:text-2xl">{t("cta_title")}</h2>
      <p className="mb-6 leading-relaxed text-white/80">
        {t("cta_description")}
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <a
          href={withUtm(LINE_URL, slug)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={trackLineClick}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FFCC00] px-6 py-3 font-semibold text-[#1A1A1A] transition-transform hover:scale-105"
        >
          <MessageCircle className="h-4 w-4" />
          {t("cta_button")}
        </a>
        <a
          href={withUtm(STUDIO_URL, slug)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-white/80 underline-offset-4 transition-colors hover:text-[#FFCC00] hover:underline"
        >
          {t("cta_secondary")}
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </aside>
  );
}
