import { reviewsRepository, moviesRepository } from "@repo/db";
import type { Database, ReviewRow } from "@repo/db";
import type {
  ReviewDto,
  UpsertReviewRequest,
  UpsertReviewResponse,
  DeleteReviewResponse,
  GetReviewResponse,
  ListReviewRatingsResponse,
  ListReviewsResponse,
} from "@repo/contracts";
import { movieToDto } from "../features/tools/movie-to-dto.js";

const toReviewDto = (row: ReviewRow): ReviewDto => ({
  id: row.id,
  movieId: row.movieId,
  rating: row.rating,
  text: row.text,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export function reviewService(db: Database) {
  const reviewsRepo = reviewsRepository(db);
  const moviesRepo = moviesRepository(db);

  return {
    async upsert(
      userId: string,
      movieId: string,
      body: UpsertReviewRequest
    ): Promise<UpsertReviewResponse> {
      const row = await reviewsRepo.upsert(userId, movieId, {
        rating: body.rating,
        text: body.text ?? null,
      });
      const movie = await moviesRepo.findById(movieId);
      const title = movie?.title ?? "movie";
      return {
        review: toReviewDto(row),
        message: `Review saved for ${title}`,
      };
    },

    async delete(
      userId: string,
      movieId: string
    ): Promise<DeleteReviewResponse> {
      const count = await reviewsRepo.delete(userId, movieId);
      if (count === 0) {
        return {
          deleted: false,
          message: "No review found for this movie",
        };
      }
      const movie = await moviesRepo.findById(movieId);
      const title = movie?.title ?? "movie";
      return { deleted: true, message: `Review deleted for ${title}` };
    },

    async get(userId: string, movieId: string): Promise<GetReviewResponse> {
      const row = await reviewsRepo.findByUserAndMovie(userId, movieId);
      return { review: row ? toReviewDto(row) : null };
    },

    async listRatings(userId: string): Promise<ListReviewRatingsResponse> {
      const rows = await reviewsRepo.listByUser(userId);
      const items = rows.map((r) => ({ movieId: r.movieId, rating: r.rating }));
      return { items, count: items.length };
    },

    async list(userId: string): Promise<ListReviewsResponse> {
      const rows = await reviewsRepo.listWithMoviesByUser(userId);
      const items = rows.map((r) => ({
        ...toReviewDto(r),
        movie: movieToDto(r.movie),
      }));
      return { items, count: items.length };
    },
  };
}
