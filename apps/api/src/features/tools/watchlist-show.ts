import { tool } from "ai";
import { z } from "zod";
import type { Database } from "@repo/db";
import type { MovieDto } from "@repo/contracts";
import { watchlistService } from "../../services/watchlist.js";

function movieToDto(movie: {
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  synopsis: string | null;
  genres: string[] | null;
  cast: string[] | null;
  directors: string[] | null;
  runtime: number | null;
  language: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  popularity: number | null;
  releaseDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MovieDto {
  return {
    id: movie.id,
    tmdbId: movie.tmdbId,
    title: movie.title,
    year: movie.year,
    synopsis: movie.synopsis,
    genres: movie.genres,
    cast: movie.cast,
    directors: movie.directors,
    runtime: movie.runtime,
    language: movie.language,
    posterUrl: movie.posterUrl,
    backdropUrl: movie.backdropUrl,
    popularity: movie.popularity,
    releaseDate: movie.releaseDate,
    createdAt: movie.createdAt.toISOString(),
    updatedAt: movie.updatedAt.toISOString(),
  };
}

export function createWatchlistShowTool(db: Database, userId: string) {
  const service = watchlistService(db);

  return tool({
    description:
      "Show the user's full watchlist as a poster grid, sorted by most recently added.",
    needsApproval: false,
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const { items } = await service.list(userId);
        const dtos = items.map(movieToDto);

        if (dtos.length === 0) {
          return {
            type: "watchlist-grid" as const,
            items: [],
            count: 0,
            message:
              "Your watchlist is empty. Search for movies to get started!",
          };
        }

        return {
          type: "watchlist-grid" as const,
          items: dtos,
          count: dtos.length,
        };
      } catch {
        return {
          type: "watchlist-grid" as const,
          items: [],
          count: 0,
          error: true,
          message:
            "Sorry, I couldn't load your watchlist right now. Please try again.",
        };
      }
    },
  });
}
