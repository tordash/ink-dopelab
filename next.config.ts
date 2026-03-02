import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig = {
  images: {
    formats: ["image/avif" as const, "image/webp" as const],
  },
};

export default withNextIntl(nextConfig);
