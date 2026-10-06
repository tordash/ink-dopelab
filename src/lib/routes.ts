// BM-04: route shapes for next-intl `Link` / `useRouter` (U1, landing mode i).
// Paths are locale-less AND basePath-less: next-intl adds the en prefix (en only) and Next adds the basePath.
// Keep this file import-free and erasable-TS only (no enum/namespace): `node --test` imports it directly.

export const ROUTES = { home: "/", list: "/all", about: "/about", contact: "/contact" } as const;

export const postPath = (slug: string) => `/${slug}`;
export const tagPath = (tag: string) => `/tag/${encodeURIComponent(tag)}`; // byte-identical to today's encoding (REQ F11)
export const categoryPath = (category: string) => `/category/${encodeURIComponent(category)}`;
