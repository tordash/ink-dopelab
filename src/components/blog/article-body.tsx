"use client";

import * as runtime from "react/jsx-runtime";
import { useMemo } from "react";
import { Callout } from "@/components/mdx/callout";
import { ImageFigure } from "@/components/mdx/image-figure";

const sharedComponents = {
  Callout,
  ImageFigure,
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <figure className="my-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...props}
        alt={props.alt || ""}
        className="w-full rounded-xl border border-[var(--color-border)]"
        loading="lazy"
      />
      {props.alt && (
        <figcaption className="mt-2 text-center text-sm text-[var(--color-text-tertiary)]">
          {props.alt}
        </figcaption>
      )}
    </figure>
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      {...props}
      target={props.href?.startsWith("http") ? "_blank" : undefined}
      rel={props.href?.startsWith("http") ? "noopener noreferrer" : undefined}
      className="text-[var(--color-primary)] underline decoration-[var(--color-primary)]/30 underline-offset-2 transition-colors hover:decoration-[var(--color-primary)]"
    />
  ),
};

function useMDXComponent(code: string) {
  return useMemo(() => {
    const fn = new Function(code);
    return fn({ ...runtime }).default;
  }, [code]);
}

interface ArticleBodyProps {
  code: string;
}

export function ArticleBody({ code }: ArticleBodyProps) {
  const Component = useMDXComponent(code);

  return (
    <article className="prose prose-lg max-w-none dark:prose-invert">
      <Component components={sharedComponents} />
    </article>
  );
}
