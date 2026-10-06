// BM-16 · the custom 410 page for a retired post (tordash/dopelab-oracle#19 · SPEC §9.3, S3).
//
// Pure and import-free (erasable TypeScript only), so `node --test` runs it without a build.
// Served by src/app/api/gone/route.ts. Brand: black / white / safety yellow, Kanit; no scripts,
// no analytics, noindex. Links go to the article-list hub and the blog home of the same locale,
// never to the main-site home (Helm's redirect policy: never home).

export type GoneLocale = "th" | "en";

export interface GonePageInput {
  locale: GoneLocale;
  title: string;
  hubHref: string;
  homeHref: string;
}

/** The article-list hub: /<loc>/blog on this base · <bp>/all or <bp>/en/all after BM-04 (bp = the /blog basePath). */
export function listHubHref(locale: GoneLocale, bp: string): string {
  return bp === "" ? `/${locale}/blog` : `${bp}${locale === "en" ? "/en" : ""}/all`;
}

/** The blog home: /<loc> on this base · <bp> or <bp>/en after BM-04. */
export function blogHomeHref(locale: GoneLocale, bp: string): string {
  return bp === "" ? `/${locale}` : `${bp}${locale === "en" ? "/en" : ""}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderGonePage({ locale, title, hubHref, homeHref }: GonePageInput): string {
  const titleLine = title ? `<p class="t">“${esc(title)}”</p>` : "";
  return [
    "<!doctype html>",
    `<html lang="${locale === "en" ? "en" : "th"}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    "<title>บทความนี้ถูกเก็บแล้ว · DopeLab</title>",
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;600&display=swap">',
    "<style>",
    "*{box-sizing:border-box}",
    "html,body{margin:0;background:#000000;color:#FFFFFF;font-family:Kanit,sans-serif}",
    "main{min-height:100vh;display:flex;flex-direction:column;justify-content:center;gap:16px;padding:48px 24px;max-width:640px;margin:0 auto}",
    "h1{margin:0;font-size:36px;font-weight:600;line-height:1.3}",
    ".en{margin:0;font-size:20px}",
    ".t{margin:8px 0 0;font-size:18px;opacity:.8}",
    "a{font-size:18px;font-weight:600;text-decoration:none}",
    ".btn{display:inline-block;margin-top:24px;padding:14px 22px;background:#FFCC00;color:#000000;border-radius:6px;align-self:flex-start}",
    ".home{color:#FFFFFF;text-decoration:underline;align-self:flex-start}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>บทความนี้ถูกเก็บแล้ว</h1>",
    '<p class="en">This article was retired</p>',
    titleLine,
    `<a class="btn" href="${esc(hubHref)}">ดูบทความทั้งหมด · All articles</a>`,
    `<a class="home" href="${esc(homeHref)}">หน้าแรกบล็อก · Blog home</a>`,
    "</main>",
    "</body>",
    "</html>",
    "",
  ].filter((x) => x !== "").join("\n") + "\n";
}
