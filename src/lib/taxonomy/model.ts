// BM-18 (tordash/dopelab-oracle#27): taxonomy v2 model — category/tag KEYS in frontmatter and URLs, display NAMES here.
// Pure, import-free, erasable TS (house rule of routes.ts / urls.ts): `node --test` imports it directly.
// The data lives in taxonomy.json (bound by index.ts). The build guard scripts/taxonomy/check.mjs applies the same
// rules with Node stdlib only (a test asserts both agree).

export type Locale = "th" | "en";
export type Names = { th: string; en: string };
export type Category = {
  key: string;
  role: string;
  ai_topic: boolean;
  min_posts?: number;
  names: Names;
  description: Names;
};
export type Tag = { key: string; names: Names };
export type Taxonomy = { version: number; categories: Category[]; tags: Tag[] };

export const KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const CATEGORY_RANGE = [5, 7] as const;
export const TAG_RANGE = [20, 60] as const;
export const AI_SHARE_MAX = 0.2;

const blank = (s: unknown) => typeof s !== "string" || s.trim() === "";

/** AC1 rules. Returns one message per violation ([] = valid). */
export function validateTaxonomy(t: Taxonomy): string[] {
  const errs: string[] = [];
  const cats = Array.isArray(t?.categories) ? t.categories : [];
  const tags = Array.isArray(t?.tags) ? t.tags : [];
  if (cats.length < CATEGORY_RANGE[0] || cats.length > CATEGORY_RANGE[1]) {
    errs.push(`categories ${cats.length} outside ${CATEGORY_RANGE[0]}–${CATEGORY_RANGE[1]}`);
  }
  const seen = new Map<string, string>();
  for (const [kind, list] of [["category", cats], ["tag", tags]] as const) {
    for (const item of list as Array<Category | Tag>) {
      if (typeof item?.key !== "string" || !KEY_RE.test(item.key)) errs.push(`${kind} key ${JSON.stringify(item?.key)} does not match ${KEY_RE}`);
      const k = String(item?.key ?? "");
      const folded = `${kind}:${k.toLowerCase()}`;
      if (seen.has(folded)) errs.push(seen.get(folded) === k ? `duplicate ${kind} key ${k}` : `casefold duplicate ${kind} key ${k} / ${seen.get(folded)}`);
      else seen.set(folded, k);
      for (const loc of ["th", "en"] as const) if (blank(item?.names?.[loc])) errs.push(`${kind} ${k}: empty ${loc} name`);
    }
  }
  for (const c of cats) {
    for (const loc of ["th", "en"] as const) if (blank(c?.description?.[loc])) errs.push(`category ${c.key}: empty ${loc} description`);
    if (blank(c?.role)) errs.push(`category ${c.key}: empty role`);
    if (typeof c?.ai_topic !== "boolean") errs.push(`category ${c.key}: ai_topic must be true|false`);
    if (c?.min_posts !== undefined && !(Number.isInteger(c.min_posts) && c.min_posts >= 1)) errs.push(`category ${c.key}: min_posts must be an integer ≥ 1`);
  }
  const ai = cats.filter((c) => c?.ai_topic === true);
  if (ai.length !== 1) errs.push(`ai_topic keys ${ai.length}: exactly 1 required`);
  if (cats.length && ai.length / cats.length > AI_SHARE_MAX) errs.push(`ai_topic share ${Math.round((ai.length / cats.length) * 100)}% > 20%`);
  const keys = new Set(cats.map((c) => c?.key));
  for (const role of ["shop", "how-to"]) if (!keys.has(role)) errs.push(`roles: a ${role} category is required`);
  if (tags.length < TAG_RANGE[0] || tags.length > TAG_RANGE[1]) errs.push(`tags ${tags.length} outside ${TAG_RANGE[0]}–${TAG_RANGE[1]}`);
  return errs;
}

/** Display name of a key; an unknown key renders as itself (the build guard rejects it before it ships). */
export function nameOf(list: ReadonlyArray<{ key: string; names: Names }>, key: string, locale: Locale): string {
  const item = list.find((x) => x.key === key);
  return item?.names?.[locale] || key;
}

/** A category is visible in a locale iff its non-draft post count there ≥ min_posts (default 1). */
export function visible(cat: { min_posts?: number }, count: number): boolean {
  return count >= (cat.min_posts ?? 1);
}

export function aiShare(t: Taxonomy): number {
  return t.categories.length ? t.categories.filter((c) => c.ai_topic === true).length / t.categories.length : 0;
}
