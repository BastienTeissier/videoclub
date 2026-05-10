import { tool } from "ai";
import { z } from "zod";
import type { Database } from "@repo/db";
import { reviewsRepository, moviesRepository } from "@repo/db";
import type { MutationOutcome } from "@repo/contracts";
import { reviewService } from "../../services/review.js";
import { movieToDto } from "./movie-to-dto.js";

export function createReviewDeleteTool(db: Database, userId: string) {
  const service = reviewService(db);
  const reviewsRepo = reviewsRepository(db);
  const moviesRepo = moviesRepository(db);

  return tool({
    description:
      "Delete the user's review for a movie by title. When movieId is provided, skip search and delete directly.",
    needsApproval: false,
    inputSchema: z.object({
      title: z.string().describe("The movie title whose review should be deleted"),
      movieId: z
        .string()
        .optional()
        .describe("Optional movie ID to skip search and delete directly"),
    }),
    execute: async ({ title, movieId }): Promise<MutationOutcome> => {
      try {
        if (movieId) {
          const existing = await reviewsRepo.findByUserAndMovie(userId, movieId);
          if (!existing) {
            return {
              kind: "error",
              code: "no_review",
              message: "You don't have a review for that movie.",
            };
          }
          const movie = await moviesRepo.findById(movieId);
          const result = await service.delete(userId, movieId);
          return {
            kind: "success",
            affected: ["reviews"],
            message: result.message,
            ...(movie ? { movie: movieToDto(movie) } : {}),
          };
        }

        const matches = await reviewsRepo.searchReviewedMoviesByTitle(
          userId,
          title,
        );

        if (matches.length === 0) {
          return {
            kind: "error",
            code: "no_review",
            message: `You don't have a review for any movie matching '${title}'.`,
          };
        }

        if (matches.length === 1) {
          const movie = matches[0]!;
          const result = await service.delete(userId, movie.id);
          return {
            kind: "success",
            affected: ["reviews"],
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
            "Sorry, I couldn't delete the review right now. Please try again.",
        };
      }
    },
  });
}
