import { tool } from "ai";
import { z } from "zod";
import type { Database } from "@repo/db";
import { reviewService } from "../../services/review.js";

export function createReviewShowTool(db: Database, userId: string) {
  const service = reviewService(db);

  return tool({
    description:
      "Show all of the user's reviews as a grid, sorted by most recently updated.",
    needsApproval: false,
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const { items, count } = await service.list(userId);

        if (count === 0) {
          return {
            type: "reviews-grid" as const,
            items: [],
            count: 0,
            message: "You haven't reviewed any movies yet.",
          };
        }

        return {
          type: "reviews-grid" as const,
          items,
          count,
        };
      } catch {
        return {
          type: "reviews-grid" as const,
          items: [],
          count: 0,
          error: true,
          message:
            "Sorry, I couldn't load your reviews right now. Please try again.",
        };
      }
    },
  });
}
