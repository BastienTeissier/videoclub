import { tool } from "ai";
import { z } from "zod";
import type { Database } from "@repo/db";
import { moviesRepository } from "@repo/db";
import type { MutationOutcome } from "@repo/contracts";
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
    execute: async ({ title, movieId }): Promise<MutationOutcome> => {
      try {
        if (movieId) {
          const movie = await moviesRepo.findById(movieId);
          if (!movie) {
            return {
              kind: "error",
              code: "not_found",
              message: `No movie found with ID '${movieId}'.`,
            };
          }
          const result = await service.add(userId, movie.id);
          return {
            kind: "success",
            affected: ["watchlist"],
            message: result.message,
            movie: movieToDto(movie),
          };
        }

        const matches = await moviesRepo.searchStructured({ title });

        if (matches.length === 0) {
          return {
            kind: "error",
            code: "not_found",
            message: `I couldn't find '${title}' in the local catalog. Search for it first, then ask me to add it to your watchlist.`,
          };
        }

        if (matches.length === 1) {
          const movie = matches[0]!;
          const result = await service.add(userId, movie.id);
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
            "Sorry, I couldn't add the movie to your watchlist right now. Please try again.",
        };
      }
    },
  });
}
