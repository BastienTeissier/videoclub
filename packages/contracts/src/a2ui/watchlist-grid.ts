import { z } from "zod";
import { movieSchema } from "../domain/movie.js";

export const watchlistGridSurfaceSchema = z.object({
  type: z.literal("watchlist-grid"),
  items: z.array(movieSchema),
  count: z.number(),
  message: z.string().optional(),
  error: z.boolean().optional(),
});

export type WatchlistGridSurface = z.infer<typeof watchlistGridSurfaceSchema>;
