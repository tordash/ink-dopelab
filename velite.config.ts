import { defineConfig, defineCollection, s } from "velite";
import rehypePrettyCode from "rehype-pretty-code";
import remarkGfm from "remark-gfm";

const posts = defineCollection({
  name: "Post",
  pattern: "posts/**/*.mdx",
  schema: s
    .object({
      title: s.string().max(120),
      description: s.string().max(300),
      date: s.isodate(),
      updated: s.isodate().optional(),
      cover: s.image().optional(),
      category: s.string(),
      tags: s.array(s.string()),
      draft: s.boolean().default(false),
      featured: s.boolean().default(false),
      toc: s.toc(),
      body: s.mdx(),
      metadata: s.metadata(),
      path: s.path(),
    })
    .transform((data) => {
      // path is like "posts/th/remote-dev-setup"
      const pathParts = data.path.replace(/^posts\//, "").split("/");
      const locale = pathParts[0] as "th" | "en";
      const slugAsParams = pathParts.slice(1).join("/");
      return {
        ...data,
        locale,
        slug: `${locale}/${slugAsParams}`,
        slugAsParams,
        permalink: `/${locale}/blog/${slugAsParams}`,
      };
    }),
});

export default defineConfig({
  root: "content",
  output: {
    data: ".velite",
    assets: "public/static",
    base: "/static/",
    name: "[name]-[hash:6].[ext]",
    clean: true,
  },
  collections: { posts },
  mdx: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [
      [rehypePrettyCode, { theme: "github-dark-dimmed", keepBackground: true }],
    ],
  },
});
