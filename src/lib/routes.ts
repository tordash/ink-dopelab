// BM-04: route shapes for next-intl `Link` / `useRouter` (U1, landing mode i).
// Paths are locale-less AND basePath-less: next-intl adds the en prefix (en only) and Next adds the basePath.
// Keep this file import-free and erasable-TS only (no enum/namespace): `node --test` imports it directly.

export const ROUTES = { home: "/", list: "/all", about: "/about", contact: "/contact" } as const;

export const postPath = (slug: string) => `/${slug}`;
export const tagPath = (tag: string) => `/tag/${encodeURIComponent(tag)}`; // byte-identical to today's encoding (REQ F11)
export const categoryPath = (category: string) => `/category/${encodeURIComponent(category)}`;

/** Values that exist in BOTH locales (built server-side by getSharedSwitchIndex in locale-switch.ts). */
export type SwitchIndex = { posts: string[]; tags: string[]; categories: string[] };

/** decodeURIComponent, but keep the raw value when it is not valid percent-encoding. */
export function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/**
 * Locale switcher target (SPEC §5.6). `pathname` = next-intl usePathname(): locale-less + basePath-less.
 * Returns the same route when it exists in the other locale, else the other locale's home ("/").
 * Tag/category values are taken as everything after the prefix and decoded once, so "A%2FB-test" and
 * "A/B-test" both resolve (usePathname may return either form).
 */
export function counterpartPath(pathname: string, shared: SwitchIndex): string {
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname || "/";
  if (p === "/" || p === ROUTES.list || p === ROUTES.about || p === ROUTES.contact) return p;
  if (p.startsWith("/tag/")) {
    const v = safeDecode(p.slice("/tag/".length));
    return v && shared.tags.includes(v) ? tagPath(v) : "/";
  }
  if (p.startsWith("/category/")) {
    const v = safeDecode(p.slice("/category/".length));
    return v && shared.categories.includes(v) ? categoryPath(v) : "/";
  }
  const seg = p.slice(1);
  if (seg && !seg.includes("/") && shared.posts.includes(seg)) return postPath(seg); // slugs are ASCII (no decode)
  return "/";
}
