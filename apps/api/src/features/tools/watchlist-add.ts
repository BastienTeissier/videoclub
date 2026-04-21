import { tool } from "ai";
import { z } from "zod";
import type { Database } from "@repo/db";
import { moviesRepository } from "@repo/db";
import { watchlistService } from "../../services/watchlist.js";
import { movieToDto } from "./movie-to-dto.js";

export function createWatchlistAddTool(db: Database, userId: string) {
  const service = watchlistService(db);
  const moviesRepo = moviesRepository(db);

  return tool({
    description:
      "Add a movie to the user's watchlist by title. When movieId is provided, skip search and add directly.",
    needsApproval: false,
    inputSchema: z.object({
      title: z.string().describe("The movie title to add"),
      movieId: z
        .string()
        .optional()
        .describe("Optional movie ID to skip search and add directly"),
    }),
    execute: async ({ title, movieId }) => {
      try {
        // Direct add by movieId
        if (movieId) {
          const movie = await moviesRepo.findById(movieId);
          if (!movie) {
            return {
              error: "not_found",
              message: `No movie found with ID '${movieId}'.`,
            };
          }
          const result = await service.add(userId, movie.id);
          return {
            added: result.added,
            message: result.message,
            movieId: movie.id,
            movie: movieToDto(movie),
          };
        }

        // Search by title in local DB
        const matches = await moviesRepo.searchStructured({ title });

        if (matches.length === 0) {
          return {
            error: "not_found",
            message: `I couldn't find '${title}' in the local catalog. Search for it first, then ask me to add it to your watchlist.`,
          };
        }

        if (matches.length === 1) {
          const movie = matches[0]!;
          const result = await service.add(userId, movie.id);
          return {
            added: result.added,
            message: result.message,
            movieId: movie.id,
            movie: movieToDto(movie),
          };
        }

        // Multiple matches — ask for clarification
        return {
          clarification_needed: true,
          action: "add" as const,
          candidates: matches.map(movieToDto),
        };
      } catch {
        return {
          error: "service_error",
          message:
            "Sorry, I couldn't add the movie to your watchlist right now. Please try again.",
        };
      }
    },
  });
}
