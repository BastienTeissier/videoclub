"use client";

import type { MovieDto } from "@repo/contracts";
import { useWatchlist } from "@/contexts/watchlist-context";
import { MovieCard } from "@/components/movie-card";
import { useA2UISurface } from "../store.js";
import { get } from "../json-pointer.js";
import type { RendererProps } from "../renderer-types.js";

interface GridState {
  items: MovieDto[];
  state: "ok" | "empty" | "error";
  message?: string;
}

export function WatchlistGrid({ node, surfaceId }: RendererProps) {
  const { isInWatchlist } = useWatchlist();
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

  const activeItems = state.items.filter((item) => isInWatchlist(item.id));
  const count = activeItems.length;

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        My Watchlist ({count})
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {activeItems.map((movie) => (
          <MovieCard key={movie.id} movie={movie} alwaysShowOverlays />
        ))}
      </div>
    </div>
  );
}