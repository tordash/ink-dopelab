"use client";

import { useState } from "react";
import { Link as LinkIcon, Check } from "lucide-react";
import { useTranslations } from "next-intl";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function ShareButtons({ title }: { title: string }) {
  const t = useTranslations("article");
  const [copied, setCopied] = useState(false);

  const handleShare = (platform: string) => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(title);

    const urls: Record<string, string> = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      twitter: `https://twitter.com/intent/tweet?url=${url}&text=${text}`,
    };

    if (platform === "copy") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }

    window.open(urls[platform], "_blank", "width=600,height=400");
  };

  return (
    <div className="mt-8 flex items-center gap-3 border-t border-[var(--color-border)] pt-6">
      <span className="text-sm font-medium text-[var(--color-text-secondary)]">
        {t("share")}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleShare("facebook")}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] transition-colors hover:bg-[#1877F2] hover:text-white"
          aria-label="Share on Facebook"
        >
          <FacebookIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleShare("twitter")}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-text-primary)] hover:text-[var(--color-surface)]"
          aria-label="Share on X"
        >
          <XIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleShare("copy")}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white"
          aria-label="Copy link"
        >
          {copied ? (
            <Check className="h-4 w-4 text-[var(--color-accent)]" />
          ) : (
            <LinkIcon className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
