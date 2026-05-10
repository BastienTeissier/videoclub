"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useMovieState } from "@/hooks/use-movie-state";
import { toast } from "@repo/ui";

interface BookmarkIconProps {
  movieId: string;
  movieTitle: string;
  className?: string;
}

export function BookmarkIcon({ movieId, movieTitle, className }: BookmarkIconProps) {
  const { inWatchlist, toggleWatchlist } = useMovieState(movieId);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();

    try {
      await toggleWatchlist();
      toast({
        description: inWatchlist
          ? `${movieTitle} removed from watchlist`
          : `${movieTitle} added to watchlist`,
      });
    } catch {
      toast({
        variant: "destructive",
        description: "Failed to update watchlist. Try again.",
      });
    }
  }

  const Icon = inWatchlist ? BookmarkCheck : Bookmark;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/70 text-foreground transition-opacity duration-150 hover:bg-background/90 ${className ?? ""}`}
      aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
    >
      <Icon className="h-4 w-4" fill={inWatchlist ? "currentColor" : "none"} />
    </button>
  );
}
