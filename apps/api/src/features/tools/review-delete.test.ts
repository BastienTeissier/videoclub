import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@repo/db", () => ({
  reviewsRepository: vi.fn(),
  moviesRepository: vi.fn(),
}));

vi.mock("../../services/review.js", () => ({
  reviewService: vi.fn(),
}));

import { reviewsRepository, moviesRepository } from "@repo/db";
import { reviewService } from "../../services/review.js";
import { createReviewDeleteTool } from "./review-delete.js";

const mockFindByUserAndMovie = vi.fn();
const mockSearchReviewedMoviesByTitle = vi.fn();
const mockFindById = vi.fn();
const mockDelete = vi.fn();

const mockReviewsRepository = vi.mocked(reviewsRepository);
const mockMoviesRepository = vi.mocked(moviesRepository);
const mockReviewService = vi.mocked(reviewService);

beforeEach(() => {
  vi.clearAllMocks();
  mockReviewsRepository.mockReturnValue({
    upsert: vi.fn(),
    delete: vi.fn(),
    findByUserAndMovie: mockFindByUserAndMovie,
    getReviewedMovieRatings: vi.fn(),
    listByUser: vi.fn(),
    listWithMoviesByUser: vi.fn(),
    searchReviewedMoviesByTitle: mockSearchReviewedMoviesByTitle,
  } as ReturnType<typeof reviewsRepository>);
  mockMoviesRepository.mockReturnValue({
    findById: mockFindById,
    searchByTitle: vi.fn(),
    searchStructured: vi.fn(),
    upsertFromTmdb: vi.fn(),
  } as ReturnType<typeof moviesRepository>);
  mockReviewService.mockReturnValue({
    upsert: vi.fn(),
    delete: mockDelete,
    get: vi.fn(),
    listRatings: vi.fn(),
    list: vi.fn(),
  } as ReturnType<typeof reviewService>);
});

const fakeMovie = (id: number) => ({
  id: `uuid-${id}`,
  tmdbId: id,
  title: `Movie ${id}`,
  year: 2024,
  synopsis: "A movie",
  genres: ["Drama"],
  cast: ["Actor"],
  directors: ["Director"],
  runtime: 120,
  language: "en",
  posterUrl: null,
  backdropUrl: null,
  popularity: 10,
  releaseDate: "2024-01-01",
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-01T00:00:00Z"),
});

const fakeReview = (movieId: string) => ({
  id: `r-${movieId}`,
  userId: "user-1",
  movieId,
  rating: 4,
  text: null,
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-01T00:00:00Z"),
});

function makeTool() {
  return createReviewDeleteTool(
    {} as Parameters<typeof createReviewDeleteTool>[0],
    "user-1"
  );
}

const toolContext = {
  toolCallId: "tc1",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("createReviewDeleteTool", () => {
  it("movieId provided, review exists — returns success with affected ['reviews']", async () => {
    const movie = fakeMovie(1);
    mockFindByUserAndMovie.mockResolvedValue(fakeReview("uuid-1"));
    mockFindById.mockResolvedValue(movie);
    mockDelete.mockResolvedValue({
      deleted: true,
      message: "Review deleted for Movie 1",
    });

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Movie 1", movieId: "uuid-1" },
      toolContext
    );

    expect(mockFindByUserAndMovie).toHaveBeenCalledWith("user-1", "uuid-1");
    expect(mockSearchReviewedMoviesByTitle).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith("user-1", "uuid-1");
    expect(result).toMatchObject({
      kind: "success",
      affected: ["reviews"],
      message: "Review deleted for Movie 1",
    });
    expect(
      (result as { movie: { id: string } }).movie.id,
    ).toBe("uuid-1");
  });

  it("movieId provided, review missing — returns error code no_review, no service call", async () => {
    mockFindByUserAndMovie.mockResolvedValue(null);

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Movie 1", movieId: "uuid-1" },
      toolContext
    );

    expect(mockDelete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "error", code: "no_review" });
  });

  it("title only, 1 reviewed match — returns success with affected ['reviews']", async () => {
    const movie = fakeMovie(1);
    mockSearchReviewedMoviesByTitle.mockResolvedValue([movie]);
    mockDelete.mockResolvedValue({
      deleted: true,
      message: "Review deleted for Movie 1",
    });

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1" }, toolContext);

    expect(mockSearchReviewedMoviesByTitle).toHaveBeenCalledWith(
      "user-1",
      "Movie 1"
    );
    expect(mockDelete).toHaveBeenCalledWith("user-1", "uuid-1");
    expect(result).toMatchObject({
      kind: "success",
      affected: ["reviews"],
    });
    expect((result as { movie: { id: string } }).movie.id).toBe("uuid-1");
  });

  it("title only, 0 matches — returns error code no_review mentioning title", async () => {
    mockSearchReviewedMoviesByTitle.mockResolvedValue([]);

    const tool = makeTool();
    const result = await tool.execute!({ title: "Unknown" }, toolContext);

    expect(result).toMatchObject({ kind: "error", code: "no_review" });
    expect((result as { message: string }).message).toContain("Unknown");
  });

  it("title only, multiple matches — returns needs-clarification with candidates", async () => {
    mockSearchReviewedMoviesByTitle.mockResolvedValue([
      fakeMovie(1),
      fakeMovie(2),
    ]);

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie" }, toolContext);

    expect(result).toMatchObject({ kind: "needs-clarification" });
    expect((result as { candidates: unknown[] }).candidates).toHaveLength(2);
  });

  it("service throws — returns error code service_error", async () => {
    const movie = fakeMovie(1);
    mockSearchReviewedMoviesByTitle.mockResolvedValue([movie]);
    mockDelete.mockRejectedValue(new Error("DB down"));

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1" }, toolContext);

    expect(result).toMatchObject({ kind: "error", code: "service_error" });
  });
});
