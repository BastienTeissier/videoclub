import { Hono } from "hono";
import { movieSearchRequestSchema } from "@repo/contracts";
import { db } from "../../lib/db.js";
import { movieSearchService } from "../../services/movie-search.js";

const movies = new Hono();
const service = movieSearchService(db);

movies.get("/search", async (c) => {
  const parsed = movieSearchRequestSchema.safeParse({
    q: c.req.query("q"),
  });

  if (!parsed.success) {
    return c.json({ error: "Query parameter 'q' is required" }, 400);
  }

  const results = await service.search(parsed.data.q);
  return c.json({ results });
});

export { movies };
