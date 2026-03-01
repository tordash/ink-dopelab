import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import { Inter, Sarabun, Special_Elite, Charmonman } from "next/font/google";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import "@/app/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sarabun = Sarabun({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  variable: "--font-sarabun",
  display: "swap",
});

// Typewriter/ink display font (English) — for logo & accents
const specialElite = Special_Elite({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-typewriter",
  display: "swap",
});

// Vintage Thai display font — for Thai logo & accents
const charmonman = Charmonman({
  weight: ["400", "700"],
  subsets: ["thai", "latin"],
  variable: "--font-thai-display",
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
      className={`${inter.variable} ${sarabun.variable} ${specialElite.variable} ${charmonman.variable}`}
    >
      <body className="min-h-screen bg-[var(--color-surface)] font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <NextIntlClientProvider messages={messages}>
            <div className="flex min-h-screen flex-col">
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
