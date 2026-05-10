import { tool } from "ai";
import { z } from "zod";
import type { Database } from "@repo/db";
import { moviesRepository } from "@repo/db";
import type { MovieDto } from "@repo/contracts";
import { reviewFormSurfaceMessages } from "../../services/agents/a2ui-emitter.js";
import { movieToDto } from "./movie-to-dto.js";

interface PrefillSuccessOutput {
  data: { movie: MovieDto; rating: number; text?: string };
  a2uiMessages: ReturnType<typeof reviewFormSurfaceMessages>;
}

interface PrefillErrorOutput {
  kind: "error";
  code: "not_found" | "service_error";
  message: string;
}

interface PrefillNeedsClarificationOutput {
  kind: "needs-clarification";
  candidates: MovieDto[];
}

type PrefillOutput =
  | PrefillSuccessOutput
  | PrefillErrorOutput
  | PrefillNeedsClarificationOutput;

export function createReviewPrefillTool(db: Database, _userId: string) {
  const moviesRepo = moviesRepository(db);

  return tool({
    description:
      "Prepare a prefilled review form for a movie as an A2UI surface. Interpret the user's sentiment as a 0.5–5.0 star rating (half-star increments) and pass it via the rating parameter. Emits a review-form surface for the user to confirm — does NOT save the review.",
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
    execute: async ({ title, movieId, rating, text }): Promise<PrefillOutput> => {
      try {
        const buildSuccess = (movie: MovieDto): PrefillSuccessOutput => ({
          data: { movie, rating, text },
          a2uiMessages: reviewFormSurfaceMessages({ movie, rating, text }),
        });

        if (movieId) {
          const movie = await moviesRepo.findById(movieId);
          if (!movie) {
            return {
              kind: "error",
              code: "not_found",
              message: `No movie found with ID '${movieId}'.`,
            };
          }
          return buildSuccess(movieToDto(movie));
        }

        const matches = await moviesRepo.searchStructured({ title });

        if (matches.length === 0) {
          return {
            kind: "error",
            code: "not_found",
            message: `I couldn't find '${title}' in the local catalog. Search for it first, then ask me to review it.`,
          };
        }

        if (matches.length === 1) {
          return buildSuccess(movieToDto(matches[0]!));
        }

        return {
          kind: "needs-clarification",
          candidates: matches.map(movieToDto),
        };
      } catch {
        return {
          kind: "error",
          code: "service_error",
          message: "Sorry, I couldn't prepare the review form right now.",
        };
      }
    },
  });
}
