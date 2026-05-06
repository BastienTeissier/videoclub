import { z } from "zod";
import { movieSchema } from "./movie.js";

export const reviewSchema = z.object({
  id: z.string().uuid(),
  movieId: z.string().uuid(),
  rating: z.number(),
  text: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ReviewDto = z.infer<typeof reviewSchema>;

export const reviewWithMovieSchema = reviewSchema.extend({
  movie: movieSchema,
});

export type ReviewWithMovieDto = z.infer<typeof reviewWithMovieSchema>;
