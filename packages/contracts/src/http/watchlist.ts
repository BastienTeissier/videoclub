import { z } from "zod";
import { movieSchema } from "../domain/movie.js";

export const addToWatchlistResponseSchema = z.object({
  added: z.boolean(),
  message: z.string(),
});

export type AddToWatchlistResponse = z.infer<
  typeof addToWatchlistResponseSchema
>;

export const removeFromWatchlistResponseSchema = z.object({
  removed: z.boolean(),
  message: z.string(),
});

export type RemoveFromWatchlistResponse = z.infer<
  typeof removeFromWatchlistResponseSchema
>;

export const watchlistResponseSchema = z.object({
  items: z.array(movieSchema),
  count: z.number(),
});

export type WatchlistResponse = z.infer<typeof watchlistResponseSchema>;
