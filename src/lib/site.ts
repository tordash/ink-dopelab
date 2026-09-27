/**
 * Canonical absolute site origin, e.g. "https://ink.dopelab.studio".
 * Trimmed defensively: the env value has shipped with a trailing newline,
 * which leaked "\n" into sitemap <loc> and robots.txt URLs.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://ink.dopelab.studio"
).replace(/\/+$/, "");
