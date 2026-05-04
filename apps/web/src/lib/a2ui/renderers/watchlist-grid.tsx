"use client";

import type { WatchlistGridSurface } from "@repo/contracts";
import { useWatchlist } from "@/contexts/watchlist-context";
import { MovieCard } from "@/components/movie-card";

interface WatchlistGridProps {
  data: WatchlistGridSurface;
}

export function WatchlistGrid({ data }: WatchlistGridProps) {
  const { isInWatchlist } = useWatchlist();

  if (data.error) {
    return <p className="text-sm text-destructive">{data.message}</p>;
  }

  if (data.items.length === 0) {
    return <p className="text-sm text-muted">{data.message}</p>;
  }

  const activeItems = data.items.filter((item) => isInWatchlist(item.id));
  const count = activeItems.length;

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        My Watchlist ({count})
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {activeItems.map((movie) => (
          <MovieCard key={movie.id} movie={movie} alwaysShowBookmark />
        ))}
      </div>
    </div>
  );
}
