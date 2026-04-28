import { z } from "zod";

export const reviewSchema = z.object({
  id: z.string().uuid(),
  movieId: z.string().uuid(),
  rating: z.number(),
  text: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ReviewDto = z.infer<typeof reviewSchema>;
