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
      // caption URL mismatch fix รอบ 2 (18 ก.ย. 2569 — golden G2 สแกนเจอ)
      { source: "/th/blog/anthropic-ipo-trillion-dollar-ai", destination: "/th/blog/anthropic-ipo-350b", permanent: true },
      { source: "/th/blog/ai-catches-competitor-price-cheating", destination: "/th/blog/ai-competitor-price-monitor", permanent: true },
      // locale-less /blog/* เคยเป็น 404 เปล่า — กัน external link ที่ไม่มี /th (Helm triple-check 18 ก.ย.)
      { source: "/blog", destination: "/th/blog", permanent: true },
      { source: "/blog/:path*", destination: "/th/blog/:path*", permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
