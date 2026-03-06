import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import { League_Spartan, Kanit, Special_Elite } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import Script from "next/script";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { SearchProvider } from "@/components/layout/search-provider";
import "@/app/globals.css";

const leagueSpartan = League_Spartan({
  subsets: ["latin"],
  variable: "--font-league",
  display: "swap",
});

const kanit = Kanit({
  weight: ["300", "400", "500", "600", "700", "800"],
  subsets: ["thai", "latin"],
  variable: "--font-kanit",
  display: "swap",
});

// Typewriter/ink display font (English) — for INK wordmark only
const specialElite = Special_Elite({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-typewriter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "INK by DopeLab — AI × Digital Marketing Blog",
    template: "%s | INK by DopeLab",
  },
  description:
    "บล็อกเกี่ยวกับ AI, Digital Marketing, และ Business Automation จากประสบการณ์จริง",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://ink.dopelab.studio"
  ),
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "th" | "en")) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${leagueSpartan.variable} ${kanit.variable} ${specialElite.variable}`}
    >
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-SVY8Q547WJ"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-SVY8Q547WJ');
          `}
        </Script>
        <link
          rel="alternate"
          type="application/rss+xml"
          title="INK by DopeLab"
          href="/feed.xml"
        />
      </head>
      <body className="min-h-screen bg-[var(--color-surface)] font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <NextIntlClientProvider messages={messages}>
            <div className="flex min-h-screen flex-col">
              <Header searchSlot={<SearchProvider locale={locale as "th" | "en"} />} />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
            <Analytics />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
