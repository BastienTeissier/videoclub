import { tool } from "ai";
import { z } from "zod";
import type { Database } from "@repo/db";
import { reviewService } from "../../services/review.js";
import { reviewsGridMessages } from "../../services/agents/a2ui-emitter.js";

export function createReviewShowTool(db: Database, userId: string) {
  const service = reviewService(db);

  return tool({
    description:
      "Show all of the user's reviews as a grid, sorted by most recently updated. Use ONLY when the user wants to see/browse their reviews. If the user wants to COMPARE or PICK from their reviews (e.g. 'compare the top 3 of my reviews', 'pick the highest-rated'), do not stop after this tool — chain into the `discovery` tool with view='comparison' or view='night-plan' in the same turn, using IDs from this tool's result.",
    needsApproval: false,
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const { items, count } = await service.list(userId);
        const message =
          count === 0 ? "You haven't reviewed any movies yet." : undefined;

        return {
          data: {
            type: "reviews-grid" as const,
            items,
            count,
            ...(message ? { message } : {}),
          },
          a2uiMessages: reviewsGridMessages({ items, message }),
        };
      } catch {
        const errorMessage =
          "Sorry, I couldn't load your reviews right now. Please try again.";
        return {
          data: {
            type: "reviews-grid" as const,
            items: [],
            count: 0,
            error: true,
            message: errorMessage,
          },
          a2uiMessages: reviewsGridMessages({
            items: [],
            message: errorMessage,
            error: true,
          }),
        };
      }
    },
  });
}
