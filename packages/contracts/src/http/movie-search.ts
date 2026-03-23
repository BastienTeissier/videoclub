import { z } from "zod";
import { movieSchema } from "../domain/movie.js";

export const movieSearchRequestSchema = z.object({
  q: z.string().min(1),
});

export type MovieSearchRequest = z.infer<typeof movieSearchRequestSchema>;

export const movieSearchResponseSchema = z.object({
  results: z.array(movieSchema),
});

export type MovieSearchResponse = z.infer<typeof movieSearchResponseSchema>;
