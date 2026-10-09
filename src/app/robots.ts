import type { MetadataRoute } from "next";
import { blogFileUrl } from "@/lib/seo";


export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: blogFileUrl("sitemap"), // BM-05 (D10): the sitemap of this build's mode
  };
}
