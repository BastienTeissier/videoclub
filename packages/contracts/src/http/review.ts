import { z } from "zod";
import { reviewSchema, reviewWithMovieSchema } from "../domain/review.js";

export const upsertReviewRequestSchema = z.object({
  rating: z.number().min(0.5).max(5).multipleOf(0.5),
  text: z.string().max(2000).optional(),
});

export type UpsertReviewRequest = z.infer<typeof upsertReviewRequestSchema>;

export const upsertReviewResponseSchema = z.object({
  review: reviewSchema,
  message: z.string(),
});

export type UpsertReviewResponse = z.infer<typeof upsertReviewResponseSchema>;

export const deleteReviewResponseSchema = z.object({
  deleted: z.boolean(),
  message: z.string(),
});

export type DeleteReviewResponse = z.infer<typeof deleteReviewResponseSchema>;

export const getReviewResponseSchema = z.object({
  review: reviewSchema.nullable(),
});

export type GetReviewResponse = z.infer<typeof getReviewResponseSchema>;

export const listReviewRatingsResponseSchema = z.object({
  items: z.array(
    z.object({
      movieId: z.string().uuid(),
      rating: z.number(),
    })
  ),
  count: z.number(),
});

export type ListReviewRatingsResponse = z.infer<
  typeof listReviewRatingsResponseSchema
>;

export const listReviewsResponseSchema = z.object({
  items: z.array(reviewWithMovieSchema),
  count: z.number(),
});

export type ListReviewsResponse = z.infer<typeof listReviewsResponseSchema>;
