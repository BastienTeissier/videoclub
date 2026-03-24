import { ilike, eq, and, desc, sql, type SQL } from "drizzle-orm";
import { movies, type NewMovie } from "../schema/movies.js";
import type { Database } from "../client/index.js";

interface SearchStructuredParams {
  title?: string;
  director?: string;
  actor?: string;
  genre?: string;
  year?: number;
}

function arrayIlike(column: SQL, value: string): SQL {
  return sql`EXISTS (SELECT 1 FROM unnest(${column}) el WHERE el ILIKE ${`%${value}%`})`;
}

export function moviesRepository(db: Database) {
  return {
    async searchByTitle(query: string) {
      return db
        .select()
        .from(movies)
        .where(ilike(movies.title, `%${query}%`));
    },

    async searchStructured(params: SearchStructuredParams) {
      const conditions: SQL[] = [];

      if (params.title) {
        conditions.push(ilike(movies.title, `%${params.title}%`));
      }
      if (params.director) {
        conditions.push(arrayIlike(movies.directors, params.director));
      }
      if (params.actor) {
        conditions.push(arrayIlike(movies.cast, params.actor));
      }
      if (params.genre) {
        conditions.push(arrayIlike(movies.genres, params.genre));
      }
      if (params.year) {
        conditions.push(eq(movies.year, params.year));
      }

      return db
        .select()
        .from(movies)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(movies.popularity))
        .limit(10);
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
