import { z } from "zod";
import { reviewWithMovieSchema } from "../domain/review";

export const reviewsGridSurfaceSchema = z.object({
  type: z.literal("reviews-grid"),
  items: z.array(reviewWithMovieSchema),
  count: z.number(),
  message: z.string().optional(),
  error: z.boolean().optional(),
});

export type ReviewsGridSurface = z.infer<typeof reviewsGridSurfaceSchema>;