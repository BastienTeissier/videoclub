import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { watchlistService } from "../../services/watchlist.js";

type Variables = {
  userId: string;
};

const watchlist = new Hono<{ Variables: Variables }>();
const service = watchlistService(db);

const movieIdSchema = z.string().uuid();

watchlist.post("/:movieId", async (c) => {
  const parsed = movieIdSchema.safeParse(c.req.param("movieId"));

  if (!parsed.success) {
    return c.json({ error: "Invalid movieId, must be a UUID" }, 400);
  }

  const userId = c.get("userId");
  const result = await service.add(userId, parsed.data);
  return c.json(result);
});

watchlist.delete("/:movieId", async (c) => {
  const parsed = movieIdSchema.safeParse(c.req.param("movieId"));

  if (!parsed.success) {
    return c.json({ error: "Invalid movieId, must be a UUID" }, 400);
  }

  const userId = c.get("userId");
  const result = await service.remove(userId, parsed.data);
  return c.json(result);
});

watchlist.get("/", async (c) => {
  const userId = c.get("userId");
  const result = await service.list(userId);
  return c.json(result);
});

export { watchlist };
