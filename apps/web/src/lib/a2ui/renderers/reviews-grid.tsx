"use client";

import type { ReviewWithMovieDto } from "@repo/contracts";
import { StarRating } from "@repo/ui";
import { MovieCard } from "@/components/movie-card";
import { useA2UISurface } from "../store";
import { get } from "../json-pointer";
import type { RendererProps } from "../renderer-types";

interface GridState {
  items: ReviewWithMovieDto[];
  state: "ok" | "empty" | "error";
  message?: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(iso: string) {
  return dateFormatter.format(new Date(iso));
}

export function ReviewsGrid({ node, surfaceId }: RendererProps) {
  const surface = useA2UISurface(surfaceId);
  const path = node.data?.path;
  const state = path
    ? (get(surface?.dataModel, path) as GridState | undefined)
    : undefined;

  if (!state) return null;
  if (state.state === "error") {
    return <p className="text-sm text-destructive">{state.message}</p>;
  }
  if (state.state === "empty") {
    return <p className="text-sm text-muted">{state.message}</p>;
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        My Reviews ({state.items.length})
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {state.items.map((item) => (
          <div key={item.id} className="flex flex-col gap-1.5">
            <MovieCard movie={item.movie} alwaysShowOverlays />
            <div className="flex items-center gap-1.5">
              <StarRating value={item.rating} readOnly size="sm" />
              <span className="text-xs text-muted">{item.rating}</span>
            </div>
            {item.text && (
              <p className="line-clamp-2 text-xs text-muted">{item.text}</p>
            )}
            <p className="text-xs text-muted">{formatDate(item.updatedAt)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
