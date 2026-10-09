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
 * ADR-01 X4: optional absolute asset prefix (e.g. "https://<asset-host>/blog") for `assetPrefix` + `images.path`
 * and (X4-f) the raw <img> srcs below.
 * On only when BLOG_ASSET_PREFIX is set AND VERCEL_ENV is unset (local proof) or "production"
 * (so `bm/*` previews and Gate 1 never get it). A set value must be an absolute http(s) URL without a
 * trailing "/", otherwise the build fails. next.config.ts inlines the RESOLVED value ("" when off) as
 * process.env.BLOG_ASSET_PREFIX into the server and client bundles, so both render the same <img> src
 * (no hydration mismatch, no client re-render back to the Worker) whatever env `next start` gets.
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

/**
 * ADR-01 X4-f (Helm (ก), #5 6018411118): a raw <img> src on the asset host when the prefix is on, so image-heavy
 * posts stop going through the Worker. Every image src in the app already carries BASE_PATH (MDX rewrite, velite
 * `base`, withBasePath) and the prefix already ends in BASE_PATH, so "/blog/x" → `${prefix}/x` (never "/blog/blog").
 * Anything else ("http(s):", "//", "data:", "#", a path outside BASE_PATH) and prefix off → the same string.
 * Not for `next/image` (images.path) or og:image / JSON-LD (BM-05).
 */
export function withAssetHost(src: string, prefix: string | undefined = ASSET_PREFIX): string {
  if (!prefix || !src.startsWith(`${BASE_PATH}/`)) return src;
  return `${prefix}${src.slice(BASE_PATH.length)}`;
}

/** A public/ file used as a raw <img> src: withBasePath, then the asset host when the prefix is on. */
export function publicAssetSrc(path: string, prefix: string | undefined = ASSET_PREFIX): string {
  return withAssetHost(withBasePath(path), prefix);
}

type JsxFn = (type: never, props: never, key?: never) => unknown;
type AnyJsx = (type: unknown, props: unknown, key?: unknown) => unknown;

/**
 * X4-f: a literal JSX `<img>` written in MDX compiles to `jsx("img", {…})` and never reaches `components.img`.
 * This wraps the MDX runtime's jsx/jsxs so such an <img> src goes through withAssetHost too.
 * Prefix off → the runtime object itself (nothing wrapped, output unchanged).
 */
export function withAssetHostMdxRuntime<R extends { jsx: JsxFn; jsxs: JsxFn }>(
  runtime: R,
  prefix: string | undefined = ASSET_PREFIX,
): R {
  if (!prefix) return runtime;
  const wrap = (f: JsxFn): AnyJsx => (type, props, key) => {
    const p = props as { src?: unknown } | null | undefined;
    const mapped = type === "img" && p && typeof p.src === "string" ? { ...p, src: withAssetHost(p.src, prefix) } : props;
    return (f as unknown as AnyJsx)(type, mapped, key);
  };
  return { ...runtime, jsx: wrap(runtime.jsx), jsxs: wrap(runtime.jsxs) };
}
