// BM-05 (REQ D2, S-1): the blog's absolute site origin (no path). Every bm/* preview builds without
// NEXT_PUBLIC_SITE_URL (it is Production-scoped), so the code fallback is the new host.
// Trimmed defensively: the env value has shipped with a trailing newline, which leaked "\n" into sitemap <loc> and
// robots.txt URLs. A path, query or hash fails the build (it would produce a doubled basePath).
// Import-free + erasable TS: next.config.ts and node --test import it directly.
export const DEFAULT_SITE_URL = "https://dopelab.studio";

export function resolveSiteUrl(raw: string | undefined): string {
  const v = ((raw ?? "").trim() || DEFAULT_SITE_URL).replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s?#]+$/.test(v)) {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL=${JSON.stringify(raw)} is not supported: use an http(s) origin with no path, query or hash ` +
        `(e.g. ${JSON.stringify(DEFAULT_SITE_URL)}) or unset it (BM-05 S-1).`,
    );
  }
  return v;
}

export const SITE_URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
