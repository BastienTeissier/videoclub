import { eq, and, inArray } from "drizzle-orm";
import { reviews, type Review } from "../schema/reviews.js";
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
  };
}
