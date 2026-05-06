import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/review.js", () => ({
  reviewService: vi.fn(),
}));

import { reviewService } from "../../services/review.js";
import { createReviewShowTool } from "./review-show.js";

const mockList = vi.fn();
const mockReviewService = vi.mocked(reviewService);

beforeEach(() => {
  vi.clearAllMocks();
  mockReviewService.mockReturnValue({
    upsert: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    listRatings: vi.fn(),
    list: mockList,
  } as ReturnType<typeof reviewService>);
});

function makeTool() {
  return createReviewShowTool(
    {} as Parameters<typeof createReviewShowTool>[0],
    "user-1",
  );
}

const fakeMovieDto = (id: number) => ({
  id: `uuid-${id}`,
  tmdbId: id,
  title: `Movie ${id}`,
  year: 2024,
  synopsis: null,
  genres: null,
  cast: null,
  directors: null,
  runtime: null,
  language: null,
  posterUrl: null,
  backdropUrl: null,
  popularity: null,
  releaseDate: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
});

const fakeReviewWithMovie = (id: number) => ({
  id: `rev-${id}`,
  movieId: `uuid-${id}`,
  rating: 4,
  text: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  movie: fakeMovieDto(id),
});

const toolContext = {
  toolCallId: "tc1",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("createReviewShowTool", () => {
  it("returns reviews-grid surface with items and count", async () => {
    mockList.mockResolvedValue({
      items: [fakeReviewWithMovie(1), fakeReviewWithMovie(2), fakeReviewWithMovie(3)],
      count: 3,
    });

    const tool = makeTool();
    const result = await tool.execute!({}, toolContext);

    expect(result).toMatchObject({
      type: "reviews-grid",
      count: 3,
    });
    expect((result as { items: unknown[] }).items).toHaveLength(3);
    expect(
      (result as { items: Array<{ movie: { id: string } }> }).items[0]!.movie.id,
    ).toBe("uuid-1");
  });

  it("empty list returns empty-state message", async () => {
    mockList.mockResolvedValue({ items: [], count: 0 });

    const tool = makeTool();
    const result = await tool.execute!({}, toolContext);

    expect(result).toEqual({
      type: "reviews-grid",
      items: [],
      count: 0,
      message: "You haven't reviewed any movies yet.",
    });
  });

  it("service failure returns reviews error message", async () => {
    mockList.mockRejectedValue(new Error("DB down"));

    const tool = makeTool();
    const result = await tool.execute!({}, toolContext);

    expect(result).toEqual({
      type: "reviews-grid",
      items: [],
      count: 0,
      error: true,
      message:
        "Sorry, I couldn't load your reviews right now. Please try again.",
    });
  });

  it("result type is always reviews-grid", async () => {
    mockList.mockResolvedValue({
      items: [fakeReviewWithMovie(1)],
      count: 1,
    });
    const tool = makeTool();
    const success = await tool.execute!({}, toolContext);
    expect((success as { type: string }).type).toBe("reviews-grid");

    mockList.mockResolvedValue({ items: [], count: 0 });
    const empty = await tool.execute!({}, toolContext);
    expect((empty as { type: string }).type).toBe("reviews-grid");

    mockList.mockRejectedValue(new Error("fail"));
    const error = await tool.execute!({}, toolContext);
    expect((error as { type: string }).type).toBe("reviews-grid");
  });
});
