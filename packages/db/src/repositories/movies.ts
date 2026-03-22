import { ilike, eq } from "drizzle-orm";
import { movies, type NewMovie } from "../schema/movies.js";
import type { Database } from "../client/index.js";

export function moviesRepository(db: Database) {
  return {
    async searchByTitle(query: string) {
      return db
        .select()
        .from(movies)
        .where(ilike(movies.title, `%${query}%`));
    },

    async upsertFromTmdb(movie: NewMovie) {
      const [result] = await db
        .insert(movies)
        .values(movie)
        .onConflictDoUpdate({
          target: movies.tmdbId,
          set: {
            title: movie.title,
            year: movie.year,
            synopsis: movie.synopsis,
            genres: movie.genres,
            cast: movie.cast,
            directors: movie.directors,
            runtime: movie.runtime,
            language: movie.language,
            posterUrl: movie.posterUrl,
            backdropUrl: movie.backdropUrl,
            popularity: movie.popularity,
            releaseDate: movie.releaseDate,
          },
        })
        .returning();
      return result!;
    },
  };
}
