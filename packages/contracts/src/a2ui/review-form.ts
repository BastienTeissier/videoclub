import { z } from "zod";
import { movieSchema } from "../domain/movie.js";

export const reviewFormSurfaceSchema = z.object({
  type: z.literal("review-form"),
  movie: movieSchema,
  rating: z.number().min(0.5).max(5).multipleOf(0.5),
  text: z.string().optional(),
});

export type ReviewFormSurface = z.infer<typeof reviewFormSurfaceSchema>;
