import { tool } from "ai";
import { z } from "zod";
import type { Database } from "@repo/db";
import { watchlistRepository, moviesRepository } from "@repo/db";
import { watchlistService } from "../../services/watchlist.js";
import { movieToDto } from "./movie-to-dto.js";

export function createWatchlistRemoveTool(db: Database, userId: string) {
  const service = watchlistService(db);
  const watchlistRepo = watchlistRepository(db);
  const moviesRepo = moviesRepository(db);

  return tool({
    description:
      "Remove a movie from the user's watchlist by title. When movieId is provided, skip search and remove directly.",
    needsApproval: false,
    inputSchema: z.object({
      title: z.string().describe("The movie title to remove"),
      movieId: z
        .string()
        .optional()
        .describe("Optional movie ID to skip search and remove directly"),
    }),
    execute: async ({ title, movieId }) => {
      try {
        // Direct remove by movieId
        if (movieId) {
          const inWatchlist = await watchlistRepo.isInWatchlist(userId, movieId);
          if (!inWatchlist) {
            return {
              error: "not_in_watchlist",
              message: `That movie is not in your watchlist.`,
            };
          }
          const movie = await moviesRepo.findById(movieId);
          const result = await service.remove(userId, movieId);
          return {
            removed: result.removed,
            message: result.message,
            movieId,
            movie: movie ? movieToDto(movie) : null,
          };
        }

        // Search by title within user's watchlist
        const matches = await watchlistRepo.searchByTitleInWatchlist(userId, title);

        if (matches.length === 0) {
          return {
            error: "not_in_watchlist",
            message: `No movie matching '${title}' found in your watchlist.`,
          };
        }

        if (matches.length === 1) {
          const movie = matches[0]!;
          const result = await service.remove(userId, movie.id);
          return {
            removed: result.removed,
            message: result.message,
            movieId: movie.id,
            movie: movieToDto(movie),
          };
        }

        // Multiple matches — ask for clarification
        return {
          clarification_needed: true,
          action: "remove" as const,
          candidates: matches.map(movieToDto),
        };
      } catch {
        return {
          error: "service_error",
          message:
            "Sorry, I couldn't remove the movie from your watchlist right now. Please try again.",
        };
      }
    },
  });
}
