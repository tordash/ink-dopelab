import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import { createMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";
import { HeroBackground } from "@/components/hero-background";
import {
  Bot,
  Brain,
  BarChart3,
  Megaphone,
  Code2,
  PenTool,
  Users,
  Sparkles,
  ArrowRight,
  FileText,
  Globe,
  Zap,
} from "lucide-react";

export async function generateMetadata() {
  const locale = (await getLocale()) as Locale;
  return createMetadata({
    title: locale === "th" ? "เกี่ยวกับ INK" : "About INK",
    description:
      locale === "th"
        ? "INK by DopeLab — บล็อกที่บันทึก case studies จริงจากการใช้ AI ในธุรกิจ โดย DopeLab Studio"
        : "INK by DopeLab — A blog documenting real AI case studies in business by DopeLab Studio",
    path: "/about",
    locale,
  });
}

export default async function AboutPage() {
  return (
    <>
      <HeroSection />
      <div className="mx-auto max-w-[var(--container-wide)] px-4 sm:px-6">
        <WhoWeAreSection />
        <AITeamSection />
        <WhatIsInkSection />
        <TechStackSection />
        <CTASection />
      </div>
    </>
  );
}

function HeroSection() {
  const t = useTranslations("about");
  return (
    <section className="relative overflow-hidden border-b border-[var(--color-border)] bg-[#0a0a0a]">
      {/* Background image — flowing ink + golden particles */}
      <img
        src="/about-hero-bg.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50"
      />
      {/* Particle animation */}
      <HeroBackground />
      {/* Overlay for text readability */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 to-black/70" />
      <div className="relative mx-auto max-w-[var(--container-wide)] px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#FFCC00]/30 bg-[#FFCC00]/10 px-5 py-2 text-sm font-medium text-[#FFCC00]">
            <Bot className="h-4 w-4" />
            <span>{t("hero_badge")}</span>
          </div>
          <h1 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
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

function WhoWeAreSection() {
  const t = useTranslations("about");
  return (
    <section className="py-12 sm:py-16">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-8 w-1 rounded-full bg-[var(--color-secondary)]" />
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          {t("who_title")}
        </h2>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <p className="text-lg leading-relaxed text-[var(--color-text-secondary)]">
            {t("who_p1")}
          </p>
          <p className="text-lg leading-relaxed text-[var(--color-text-secondary)]">
            {t("who_p2")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: Megaphone, label: t("stat_campaigns"), value: "50+" },
            { icon: Users, label: t("stat_clients"), value: "6+" },
            { icon: Bot, label: t("stat_agents"), value: "11" },
            { icon: Zap, label: t("stat_automations"), value: "24/7" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-6 text-center"
            >
              <stat.icon className="h-6 w-6 text-[var(--color-primary)]" />
              <span className="text-2xl font-extrabold text-[var(--color-text-primary)]">
                {stat.value}
              </span>
              <span className="text-sm text-[var(--color-text-tertiary)]">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const AGENTS = [
  { icon: Brain, key: "strategy" },
  { icon: PenTool, key: "content" },
  { icon: Megaphone, key: "media" },
  { icon: BarChart3, key: "data" },
  { icon: Code2, key: "web" },
  { icon: Sparkles, key: "tech" },
] as const;

function AITeamSection() {
  const t = useTranslations("about");
  return (
    <section className="border-t border-[var(--color-border)] py-12 sm:py-16">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-8 w-1 rounded-full bg-[var(--color-accent)]" />
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          {t("team_title")}
        </h2>
      </div>
      <p className="mb-8 max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
        {t("team_description")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map((agent) => (
          <div
            key={agent.key}
            className="group flex items-start gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all hover:border-[var(--color-primary)]/30 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] transition-colors group-hover:bg-[var(--color-primary)]/15">
              <agent.icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--color-text-primary)]">
                {t(`agent_${agent.key}_name`)}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-tertiary)]">
                {t(`agent_${agent.key}_desc`)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WhatIsInkSection() {
  const t = useTranslations("about");
  return (
    <section className="border-t border-[var(--color-border)] py-12 sm:py-16">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-8 w-1 rounded-full bg-[var(--color-secondary)]" />
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          {t("ink_title")}
        </h2>
      </div>
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-6 sm:p-8">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { icon: FileText, key: "ink_point_1" },
            { icon: Globe, key: "ink_point_2" },
            { icon: Zap, key: "ink_point_3" },
          ].map((item) => (
            <div key={item.key} className="flex flex-col gap-3">
              <item.icon className="h-6 w-6 text-[var(--color-secondary)]" />
              <h3 className="font-semibold text-[var(--color-text-primary)]">
                {t(`${item.key}_title`)}
              </h3>
              <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {t(`${item.key}_desc`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TechStackSection() {
  const t = useTranslations("about");
  const stack = [
    "Next.js 16",
    "Velite (MDX)",
    "Tailwind CSS v4",
    "next-intl (TH/EN)",
    "Vercel",
    "AI-Assisted Writing",
  ];
  return (
    <section className="border-t border-[var(--color-border)] py-12 sm:py-16">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-8 w-1 rounded-full bg-[var(--color-primary)]" />
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          {t("tech_title")}
        </h2>
      </div>
      <p className="mb-6 max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
        {t("tech_description")}
      </p>
      <div className="flex flex-wrap gap-3">
        {stack.map((tech) => (
          <span
            key={tech}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)]"
          >
            {tech}
          </span>
        ))}
      </div>
    </section>
  );
}

function CTASection() {
  const t = useTranslations("about");
  return (
    <section className="border-t border-[var(--color-border)] py-12 sm:py-16">
      <div className="mx-auto max-w-2xl rounded-2xl bg-gradient-to-br from-[#1A1A1A] to-[#000000] p-8 text-center text-white sm:p-12">
        <h2 className="mb-4 text-2xl font-bold sm:text-3xl">
          {t("cta_title")}
        </h2>
        <p className="mb-8 text-lg leading-relaxed text-white/80">
          {t("cta_description")}
        </p>
        <a
          href="https://line.me/R/ti/p/@dopelab.studio"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-[#FFCC00] px-6 py-3 font-semibold text-[#1A1A1A] transition-transform hover:scale-105"
        >
          {t("cta_button")}
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}
