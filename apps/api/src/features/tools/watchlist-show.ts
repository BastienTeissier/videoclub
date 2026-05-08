import { tool } from "ai";
import { z } from "zod";
import type { Database } from "@repo/db";
import { watchlistService } from "../../services/watchlist.js";
import { movieToDto } from "./movie-to-dto.js";
import { watchlistGridMessages } from "../../services/agents/a2ui-emitter.js";

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
        const message =
          dtos.length === 0
            ? "Your watchlist is empty. Search for movies to get started!"
            : undefined;

        return {
          data: {
            type: "watchlist-grid" as const,
            items: dtos,
            count: dtos.length,
            ...(message ? { message } : {}),
          },
          a2uiMessages: watchlistGridMessages({
            items: dtos,
            message,
          }),
        };
      } catch {
        const errorMessage =
          "Sorry, I couldn't load your watchlist right now. Please try again.";
        return {
          data: {
            type: "watchlist-grid" as const,
            items: [],
            count: 0,
            error: true,
            message: errorMessage,
          },
          a2uiMessages: watchlistGridMessages({
            items: [],
            message: errorMessage,
            error: true,
          }),
        };
      }
    },
  });
}
