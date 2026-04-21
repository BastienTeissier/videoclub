import { tool } from "ai";
import { z } from "zod";
import type { Database } from "@repo/db";
import { watchlistService } from "../../services/watchlist.js";
import { movieToDto } from "./movie-to-dto.js";

export function createWatchlistShowTool(db: Database, userId: string) {
  const service = watchlistService(db);

  return tool({
    description:
      "Show the user's full watchlist as a poster grid, sorted by most recently added.",
    needsApproval: false,
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const { items } = await service.list(userId);
        const dtos = items.map(movieToDto);

        if (dtos.length === 0) {
          return {
            type: "watchlist-grid" as const,
            items: [],
            count: 0,
            message:
              "Your watchlist is empty. Search for movies to get started!",
          };
        }

        return {
          type: "watchlist-grid" as const,
          items: dtos,
          count: dtos.length,
        };
      } catch {
        return {
          type: "watchlist-grid" as const,
          items: [],
          count: 0,
          error: true,
          message:
            "Sorry, I couldn't load your watchlist right now. Please try again.",
        };
      }
    },
  });
}
