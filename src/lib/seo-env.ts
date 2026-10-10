// BM-05: the ONE reader of BLOG_NOINDEX and INK_REDIRECT_MODE (build time; next.config.ts inlines the RESOLVED values
// into the bundles, so `next start` and on-demand renders can never see a different runtime value).
// Import-free + erasable TS: next.config.ts and node --test import it directly. BM-08 imports the redirect-mode resolver
// from here, so one build can never mix modes.

/** ADR-01 01: how the ink host answers legacy URLs. Unset = the redirect layer is not configured yet. */
export type RedirectMode = "off" | "temporary" | "permanent" | undefined;

/** `1` = noindex (Gate 1); `0` or unset = indexable; anything else fails the build. */
export function resolveNoindex(raw: string | undefined): boolean {
  const v = (raw ?? "").trim();
  if (v === "" || v === "0") return false;
  if (v === "1") return true;
  throw new Error(
    `BLOG_NOINDEX=${JSON.stringify(v)} is not supported: use "1" (noindex) or "0"/unset (indexable) (BM-05).`,
  );
}

/** Exact values only (after trim): off, temporary, permanent or unset; anything else fails the build. */
export function resolveRedirectMode(raw: string | undefined): RedirectMode {
  const v = (raw ?? "").trim();
  if (v === "") return undefined;
  if (v === "off" || v === "temporary" || v === "permanent") return v;
  throw new Error(
    `INK_REDIRECT_MODE=${JSON.stringify(v)} is not supported: use off, temporary, permanent or unset (BM-05, ADR-01 01).`,
  );
}

export const BLOG_NOINDEX = resolveNoindex(process.env.BLOG_NOINDEX);
export const INK_REDIRECT_MODE = resolveRedirectMode(process.env.INK_REDIRECT_MODE);
/** ADR-01 05 R-b precondition: ink-shaped canonical (and sitemap/feed/robots links) only in mode "off". */
export const INK_CANONICAL = INK_REDIRECT_MODE === "off";
