import { z } from "zod";

export const movieSchema = z.object({
  id: z.string().uuid(),
  tmdbId: z.number().int(),
  title: z.string(),
  year: z.number().int().nullable(),
  synopsis: z.string().nullable(),
  genres: z.array(z.string()).nullable(),
  cast: z.array(z.string()).nullable(),
  directors: z.array(z.string()).nullable(),
  runtime: z.number().int().nullable(),
  language: z.string().nullable(),
  posterUrl: z.string().nullable(),
  backdropUrl: z.string().nullable(),
  popularity: z.number().nullable(),
  releaseDate: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type MovieDto = z.infer<typeof movieSchema>;
