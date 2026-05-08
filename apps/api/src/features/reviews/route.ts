import { Hono } from "hono";
import { z } from "zod";
import { upsertReviewRequestSchema } from "@repo/contracts";
import { db } from "../../lib/db.js";
import { reviewService } from "../../services/review.js";

type Variables = {
  userId: string;
};

const reviews = new Hono<{ Variables: Variables }>();
const service = reviewService(db);

const movieIdSchema = z.string().uuid();

reviews.put("/:movieId", async (c) => {
  const paramParsed = movieIdSchema.safeParse(c.req.param("movieId"));
  if (!paramParsed.success) {
    return c.json({ error: "Invalid movieId, must be a UUID" }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const bodyParsed = upsertReviewRequestSchema.safeParse(body);
  if (!bodyParsed.success) {
    return c.json(
      { error: "Invalid review body", issues: bodyParsed.error.issues },
      400
    );
  }

  const userId = c.get("userId");
  const result = await service.upsert(userId, paramParsed.data, bodyParsed.data);
  return c.json(result);
});

reviews.delete("/:movieId", async (c) => {
  const paramParsed = movieIdSchema.safeParse(c.req.param("movieId"));
  if (!paramParsed.success) {
    return c.json({ error: "Invalid movieId, must be a UUID" }, 400);
  }

  const userId = c.get("userId");
  const result = await service.delete(userId, paramParsed.data);
  return c.json(result);
});

reviews.get("/:movieId", async (c) => {
  const paramParsed = movieIdSchema.safeParse(c.req.param("movieId"));
  if (!paramParsed.success) {
    return c.json({ error: "Invalid movieId, must be a UUID" }, 400);
  }

  const userId = c.get("userId");
  const result = await service.get(userId, paramParsed.data);
  return c.json(result);
});

reviews.get("/", async (c) => {
  const userId = c.get("userId");
  const result = await service.listRatings(userId);
  return c.json(result);
});

export { reviews };
