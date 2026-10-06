// BM-04 (SPEC §5.6): the locale switcher's shared-value index, built on the server from content.ts (unchanged).
// Only values that exist in BOTH locales are listed; anything else switches to the other locale's home.
import { getAllCategories, getAllTags, getPostsByLocale } from "@/lib/content";
import type { SwitchIndex } from "@/lib/routes";

const both = (a: string[], b: string[]) => {
  const s = new Set(b);
  return [...new Set(a)].filter((v) => s.has(v)).sort();
};

export function getSharedSwitchIndex(): SwitchIndex {
  return {
    posts: both(
      getPostsByLocale("th").map((p) => p.slugAsParams),
      getPostsByLocale("en").map((p) => p.slugAsParams),
    ),
    tags: both(getAllTags("th"), getAllTags("en")),
    categories: both(getAllCategories("th"), getAllCategories("en")),
  };
}
