import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig = {
  images: {
    formats: ["image/avif" as const, "image/webp" as const],
  },
  async redirects() {
    return [
      // DL-125→128 caption URL mismatch fix (29 มี.ค. 2569)
      { source: "/th/blog/google-lyria-3-pro-ai-music", destination: "/th/blog/lyria-3-pro-ai-music-generation", permanent: true },
      { source: "/th/blog/xiaomi-hunter-alpha-ai-ecosystem", destination: "/th/blog/xiaomi-hunter-alpha-600-million-ai-devices", permanent: true },
      { source: "/th/blog/human-made-anti-ai-movement", destination: "/th/blog/human-made-label-ai-backlash-premium", permanent: true },
      { source: "/th/blog/true-corp-nvidia-gtc-2026-thailand-ai", destination: "/th/blog/true-corp-nvidia-gtc-thailand-ai-infrastructure", permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
