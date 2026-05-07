import { eq, and, desc, inArray, ilike } from "drizzle-orm";
import { reviews, type Review } from "../schema/reviews.js";
import { movies, type Movie } from "../schema/movies.js";
import type { Database } from "../client/index.js";

export type ReviewRow = {
  id: string;
  userId: string;
  movieId: string;
  rating: number;
  text: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const toReviewRow = (row: Review): ReviewRow => ({
  id: row.id,
  userId: row.userId,
  movieId: row.movieId,
  rating: Number(row.rating),
  text: row.text,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export function reviewsRepository(db: Database) {
  return {
    async upsert(
      userId: string,
      movieId: string,
      input: { rating: number; text?: string | null }
    ): Promise<ReviewRow> {
      const ratingStr = input.rating.toString();
      const textValue = input.text ?? null;
      const [row] = await db
        .insert(reviews)
        .values({
          userId,
          movieId,
          rating: ratingStr,
          text: textValue,
        })
        .onConflictDoUpdate({
          target: [reviews.userId, reviews.movieId],
          set: {
            rating: ratingStr,
            text: textValue,
            updatedAt: new Date(),
          },
        })
        .returning();
      return toReviewRow(row!);
    },

    async delete(userId: string, movieId: string): Promise<number> {
      const deleted = await db
        .delete(reviews)
        .where(and(eq(reviews.userId, userId), eq(reviews.movieId, movieId)))
        .returning({ id: reviews.id });
      return deleted.length;
    },

    async findByUserAndMovie(
      userId: string,
      movieId: string
    ): Promise<ReviewRow | null> {
      const [row] = await db
        .select()
        .from(reviews)
        .where(and(eq(reviews.userId, userId), eq(reviews.movieId, movieId)))
        .limit(1);
      return row ? toReviewRow(row) : null;
    },

    async getReviewedMovieRatings(
      userId: string,
      movieIds: string[]
    ): Promise<Map<string, number>> {
      if (movieIds.length === 0) return new Map();
      const rows = await db
        .select({ movieId: reviews.movieId, rating: reviews.rating })
        .from(reviews)
        .where(
          and(eq(reviews.userId, userId), inArray(reviews.movieId, movieIds))
        );
      return new Map(rows.map((r) => [r.movieId, Number(r.rating)]));
    },

    async listByUser(userId: string): Promise<ReviewRow[]> {
      const rows = await db
        .select()
        .from(reviews)
        .where(eq(reviews.userId, userId));
      return rows.map(toReviewRow);
    },

    async listWithMoviesByUser(
      userId: string
    ): Promise<Array<ReviewRow & { movie: Movie }>> {
      const rows = await db
        .select({ review: reviews, movie: movies })
        .from(reviews)
        .innerJoin(movies, eq(reviews.movieId, movies.id))
        .where(eq(reviews.userId, userId))
        .orderBy(desc(reviews.updatedAt));
      return rows.map((r) => ({ ...toReviewRow(r.review), movie: r.movie }));
    },

    async searchReviewedMoviesByTitle(
      userId: string,
      title: string
    ): Promise<Movie[]> {
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
        .from(reviews)
        .innerJoin(movies, eq(reviews.movieId, movies.id))
        .where(
          and(eq(reviews.userId, userId), ilike(movies.title, `%${title}%`))
        )
        .orderBy(desc(reviews.updatedAt))
        .limit(10);
      return rows;
    },
  };
}
