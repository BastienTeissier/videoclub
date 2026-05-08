import { tool } from "ai";
import { z } from "zod";
import type { Database } from "@repo/db";
import { reviewsRepository, moviesRepository } from "@repo/db";
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
    execute: async ({ title, movieId }) => {
      try {
        if (movieId) {
          const existing = await reviewsRepo.findByUserAndMovie(userId, movieId);
          if (!existing) {
            return {
              error: "no_review",
              message: "You don't have a review for that movie.",
            };
          }
          const movie = await moviesRepo.findById(movieId);
          const result = await service.delete(userId, movieId);
          return {
            deleted: result.deleted,
            message: result.message,
            movieId,
            movie: movie ? movieToDto(movie) : null,
          };
        }

        const matches = await reviewsRepo.searchReviewedMoviesByTitle(
          userId,
          title
        );

        if (matches.length === 0) {
          return {
            error: "no_review",
            message: `You don't have a review for any movie matching '${title}'.`,
          };
        }

        if (matches.length === 1) {
          const movie = matches[0]!;
          const result = await service.delete(userId, movie.id);
          return {
            deleted: result.deleted,
            message: result.message,
            movieId: movie.id,
            movie: movieToDto(movie),
          };
        }

        return {
          clarification_needed: true,
          action: "review-delete" as const,
          candidates: matches.map(movieToDto),
        };
      } catch {
        return {
          error: "service_error",
          message:
            "Sorry, I couldn't delete the review right now. Please try again.",
        };
      }
    },
  });
}
