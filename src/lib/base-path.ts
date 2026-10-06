// BM-04: the ONE place that reads the blog base path (and the ADR-01 X4 asset prefix).
// Imported by next.config.ts, velite.config.ts and components. Keep it import-free.

/** velite's `output.base` type needs a template-literal type, not plain string. */
export type BasePath = `/${string}`;

export const DEFAULT_BASE_PATH: BasePath = "/blog";

export function resolveBasePath(raw: string | undefined): BasePath {
  const v = (raw ?? "").trim() || DEFAULT_BASE_PATH;
  if (v !== DEFAULT_BASE_PATH) {
    throw new Error(
      `BLOG_BASE_PATH=${JSON.stringify(v)} is not supported: MDX content links are rewritten for "/blog" only (BM-04).`,
    );
  }
  return v as BasePath;
}

export const BASE_PATH = resolveBasePath(process.env.BLOG_BASE_PATH);

/** Prefix a root-relative path; leaves "//…", "http…", "#…", "data:" untouched. */
export function withBasePath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  return path === "/" ? BASE_PATH : `${BASE_PATH}${path}`;
}

/**
 * ADR-01 X4: optional absolute asset prefix (e.g. "https://<asset-host>/blog") for `assetPrefix` + `images.path`.
 * On only when BLOG_ASSET_PREFIX is set AND VERCEL_ENV is unset (local proof) or "production"
 * (so `bm/*` previews and Gate 1 never get it). A set value must be an absolute http(s) URL without a
 * trailing "/", otherwise the build fails. Server/build only: it is not exposed to client bundles.
 */
export function resolveAssetPrefix(raw: string | undefined, vercelEnv: string | undefined): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  if (!/^https?:\/\/[^/\s?#]+(\/[^\s?#]*)?$/.test(v) || v.endsWith("/")) {
    throw new Error(
      `BLOG_ASSET_PREFIX=${JSON.stringify(v)} is not supported: use an absolute http(s) URL without a trailing "/" (e.g. "https://<asset-host>/blog") (BM-04, ADR-01 X4).`,
    );
  }
  const env = (vercelEnv ?? "").trim();
  return env === "" || env === "production" ? v : undefined;
}

export const ASSET_PREFIX = resolveAssetPrefix(process.env.BLOG_ASSET_PREFIX, process.env.VERCEL_ENV);
