import { tool } from "ai";
import { z } from "zod";
import type { Database } from "@repo/db";
import { watchlistRepository, moviesRepository } from "@repo/db";
import type { MutationOutcome } from "@repo/contracts";
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
    execute: async ({ title, movieId }): Promise<MutationOutcome> => {
      try {
        if (movieId) {
          const inWatchlist = await watchlistRepo.isInWatchlist(userId, movieId);
          if (!inWatchlist) {
            return {
              kind: "error",
              code: "not_found",
              message: "That movie is not in your watchlist.",
            };
          }
          const movie = await moviesRepo.findById(movieId);
          const result = await service.remove(userId, movieId);
          return {
            kind: "success",
            affected: ["watchlist"],
            message: result.message,
            ...(movie ? { movie: movieToDto(movie) } : {}),
          };
        }

        const matches = await watchlistRepo.searchByTitleInWatchlist(userId, title);

        if (matches.length === 0) {
          return {
            kind: "error",
            code: "not_found",
            message: `No movie matching '${title}' found in your watchlist.`,
          };
        }

        if (matches.length === 1) {
          const movie = matches[0]!;
          const result = await service.remove(userId, movie.id);
          return {
            kind: "success",
            affected: ["watchlist"],
            message: result.message,
            movie: movieToDto(movie),
          };
        }

        return {
          kind: "needs-clarification",
          candidates: matches.map(movieToDto),
        };
      } catch {
        return {
          kind: "error",
          code: "service_error",
          message:
            "Sorry, I couldn't remove the movie from your watchlist right now. Please try again.",
        };
      }
    },
  });
}
