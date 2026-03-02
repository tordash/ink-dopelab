import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import {
  getPostsByLocale,
  getAllCategories,
  getAllTags,
} from "@/lib/content";
import { BlogContent } from "@/components/blog/blog-content";
import { createMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata() {
  const locale = (await getLocale()) as Locale;
  return createMetadata({
    title: locale === "th" ? "บทความทั้งหมด" : "All Articles",
    description:
      locale === "th"
        ? "เรื่องเล่า ประสบการณ์ และ case study จากการใช้ AI ในงานจริง"
        : "Stories, experiences, and case studies from using AI in real work",
    path: "/blog",
    locale,
  });
}

export default async function BlogListPage() {
  const locale = (await getLocale()) as Locale;
  const posts = getPostsByLocale(locale);
  const categories = getAllCategories(locale);
  const tags = getAllTags(locale);

  const postData = posts.map((post) => ({
    slugAsParams: post.slugAsParams,
    title: post.title,
    description: post.description,
    date: post.date,
    category: post.category,
    tags: post.tags,
    readingTime: post.metadata.readingTime,
  }));

  return (
    <div className="mx-auto max-w-[var(--container-wide)] px-4 py-12 sm:px-6">
      <BlogHeader count={posts.length} />
      <BlogContent
        posts={postData}
        categories={categories}
        tags={tags}
        locale={locale}
      />
    </div>
  );
}

function BlogHeader({ count }: { count: number }) {
  const t = useTranslations("blog");
  return (
    <div className="mb-8">
      <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
        {t("title")}
      </h1>
      <p className="text-lg text-[var(--color-text-secondary)] sm:text-xl">
        {t("description")}
        <span className="ml-2 text-base text-[var(--color-text-tertiary)]">
          ({t("post_count", { count })})
        </span>
      </p>
    </div>
  );
}
