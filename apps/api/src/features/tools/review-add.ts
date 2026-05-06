import { tool } from "ai";
import { z } from "zod";
import type { Database } from "@repo/db";
import { moviesRepository } from "@repo/db";
import { movieToDto } from "./movie-to-dto.js";

export function createReviewAddTool(db: Database, _userId: string) {
  const moviesRepo = moviesRepository(db);

  return tool({
    description:
      "Prepare a prefilled review form for a movie. Interpret the user's sentiment as a 0.5–5.0 star rating (half-star increments) and pass it via the rating parameter. Returns a review-form surface for the user to confirm — does NOT save the review.",
    needsApproval: false,
    inputSchema: z.object({
      title: z.string().describe("The movie title to review"),
      movieId: z
        .string()
        .optional()
        .describe("Optional movie ID to skip search and prefill directly"),
      rating: z
        .number()
        .min(0.5)
        .max(5)
        .multipleOf(0.5)
        .describe("Star rating from 0.5 to 5.0 in half-star increments"),
      text: z
        .string()
        .max(2000)
        .optional()
        .describe("Optional review notes derived from the user's message"),
    }),
    execute: async ({ title, movieId, rating, text }) => {
      try {
        if (movieId) {
          const movie = await moviesRepo.findById(movieId);
          if (!movie) {
            return {
              error: "not_found",
              message: `No movie found with ID '${movieId}'.`,
            };
          }
          return {
            type: "review-form" as const,
            movie: movieToDto(movie),
            rating,
            text,
          };
        }

        const matches = await moviesRepo.searchStructured({ title });

        if (matches.length === 0) {
          return {
            error: "not_found",
            message: `I couldn't find '${title}' in the local catalog. Search for it first, then ask me to review it.`,
          };
        }

        if (matches.length === 1) {
          return {
            type: "review-form" as const,
            movie: movieToDto(matches[0]!),
            rating,
            text,
          };
        }

        return {
          clarification_needed: true,
          action: "review" as const,
          candidates: matches.map(movieToDto),
        };
      } catch {
        return {
          error: "service_error",
          message: "Sorry, I couldn't prepare the review form right now.",
        };
      }
    },
  });
}
