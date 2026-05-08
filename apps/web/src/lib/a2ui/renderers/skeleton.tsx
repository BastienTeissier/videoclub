"use client";

import type { RendererProps } from "../catalog";

const PLACEHOLDER_COUNT = 5;

export function Skeleton({ node }: RendererProps) {
  const variant = (node.variant as string | undefined) ?? "movie-grid";

  if (variant === "row") {
    return (
      <div className="h-12 w-full animate-pulse rounded-md bg-card" />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: PLACEHOLDER_COUNT }).map((_, i) => (
        <div key={i} className="aspect-[2/3] w-full animate-pulse rounded-lg bg-card" />
      ))}
    </div>
  );
}
