import { eq, and, desc, inArray } from "drizzle-orm";
import { watchlistItems } from "../schema/watchlist-items.js";
import { movies } from "../schema/movies.js";
import type { Database } from "../client/index.js";

export function watchlistRepository(db: Database) {
  return {
    async add(userId: string, movieId: string) {
      const [result] = await db
        .insert(watchlistItems)
        .values({ userId, movieId })
        .onConflictDoNothing({
          target: [watchlistItems.userId, watchlistItems.movieId],
        })
        .returning();
      return result ?? null;
    },

    async remove(userId: string, movieId: string) {
      const deleted = await db
        .delete(watchlistItems)
        .where(
          and(
            eq(watchlistItems.userId, userId),
            eq(watchlistItems.movieId, movieId)
          )
        )
        .returning();
      return deleted.length;
    },

    async listByUser(userId: string) {
      const rows = await db
        .select({
          id: movies.id,
          tmdbId: movies.tmdbId,
          title: movies.title,
          year: movies.year,
          synopsis: movies.synopsis,
          genres: movies.genres,
          cast: movies.cast,
          directors: movies.directors,
          runtime: movies.runtime,
          language: movies.language,
          posterUrl: movies.posterUrl,
          backdropUrl: movies.backdropUrl,
          popularity: movies.popularity,
          releaseDate: movies.releaseDate,
          createdAt: movies.createdAt,
          updatedAt: movies.updatedAt,
        })
        .from(watchlistItems)
        .innerJoin(movies, eq(watchlistItems.movieId, movies.id))
        .where(eq(watchlistItems.userId, userId))
        .orderBy(desc(watchlistItems.addedAt));
      return rows;
    },

    async isInWatchlist(userId: string, movieId: string) {
      const [row] = await db
        .select({ id: watchlistItems.id })
        .from(watchlistItems)
        .where(
          and(
            eq(watchlistItems.userId, userId),
            eq(watchlistItems.movieId, movieId)
          )
        )
        .limit(1);
      return !!row;
    },

    async getWatchlistedMovieIds(userId: string, movieIds: string[]) {
      if (movieIds.length === 0) return new Set<string>();

      const rows = await db
        .select({ movieId: watchlistItems.movieId })
        .from(watchlistItems)
        .where(
          and(
            eq(watchlistItems.userId, userId),
            inArray(watchlistItems.movieId, movieIds)
          )
        );
      return new Set(rows.map((r) => r.movieId));
    },
  };
}
