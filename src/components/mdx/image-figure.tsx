interface ImageFigureProps {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}

export function ImageFigure({
  src,
  alt,
  caption,
  width,
  height,
}: ImageFigureProps) {
  return (
    <figure className="my-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="w-full rounded-xl border border-[var(--color-border)] shadow-sm"
        loading="lazy"
      />
      {caption && (
        <figcaption className="mt-3 text-center text-sm text-[var(--color-text-tertiary)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
