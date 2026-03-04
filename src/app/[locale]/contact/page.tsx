import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import { createMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";
import { MessageCircle, ArrowRight } from "lucide-react";

export async function generateMetadata() {
  const locale = (await getLocale()) as Locale;
  return createMetadata({
    title: locale === "th" ? "ติดต่อเรา" : "Contact Us",
    description:
      locale === "th"
        ? "ติดต่อ DopeLab Studio — Digital Marketing Agency ที่ใช้ AI ทำงานจริง"
        : "Contact DopeLab Studio — A Digital Marketing Agency powered by AI",
    path: "/contact",
    locale,
  });
}

export default async function ContactPage() {
  return (
    <>
      <HeroSection />
      <div className="mx-auto max-w-[var(--container-wide)] px-4 sm:px-6">
        <ContactCards />
      </div>
    </>
  );
}

function HeroSection() {
  const t = useTranslations("contact");
  return (
    <section className="border-b border-[var(--color-border)] bg-[#0a0a0a] py-16 sm:py-24">
      <div className="mx-auto max-w-[var(--container-wide)] px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            {t("hero_title")}
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-gray-300 sm:text-xl">
            {t("hero_description")}
          </p>
        </div>
      </div>
    </section>
  );
}

function ContactCards() {
  const t = useTranslations("contact");
  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto grid max-w-2xl gap-6">
        {/* LINE OA — Primary */}
        <a
          href="https://line.me/R/ti/p/@dopelab.studio"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-5 rounded-2xl border-2 border-[#06C755]/30 bg-[#06C755]/5 p-6 transition-all hover:border-[#06C755]/60 hover:bg-[#06C755]/10 sm:p-8"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#06C755] text-white transition-transform group-hover:scale-110">
            <MessageCircle className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
              {t("line_title")}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {t("line_description")}
            </p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-1" />
        </a>

        {/* Facebook — Secondary */}
        <a
          href="https://www.facebook.com/profile.php?id=61585916640581"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-6 transition-all hover:border-[var(--color-primary)]/30 hover:shadow-sm sm:p-8"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#1877F2]/10 text-[#1877F2]">
            <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
              {t("fb_title")}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {t("fb_description")}
            </p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-1" />
        </a>

        {/* Business hours note */}
        <p className="text-center text-sm text-[var(--color-text-tertiary)]">
          {t("hours_note")}
        </p>
      </div>
    </section>
  );
}
