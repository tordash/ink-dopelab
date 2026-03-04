import { cn } from "@/lib/utils";

interface SvgEmbedProps {
  src: string;
  caption?: string;
  darkInvert?: boolean;
}

export function SvgEmbed({ src, caption, darkInvert }: SvgEmbedProps) {
  return (
    <figure className="not-prose my-6">
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={caption || ""}
          loading="lazy"
          className={cn("mx-auto w-full", darkInvert && "dark:invert")}
        />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-[var(--color-text-tertiary)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
