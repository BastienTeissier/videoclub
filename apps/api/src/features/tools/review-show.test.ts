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
  it("returns { data: reviews-grid, a2uiMessages } with items and count", async () => {
    mockList.mockResolvedValue({
      items: [fakeReviewWithMovie(1), fakeReviewWithMovie(2), fakeReviewWithMovie(3)],
      count: 3,
    });

    const tool = makeTool();
    const result = (await tool.execute!({}, toolContext)) as {
      data: {
        type: string;
        count: number;
        items: Array<{ movie: { id: string } }>;
      };
      a2uiMessages: unknown[];
    };

    expect(result.data.type).toBe("reviews-grid");
    expect(result.data.count).toBe(3);
    expect(result.data.items).toHaveLength(3);
    expect(result.data.items[0]!.movie.id).toBe("uuid-1");
    expect(result.a2uiMessages).toHaveLength(3);
  });

  it("empty list returns empty-state message in data and a2uiMessages", async () => {
    mockList.mockResolvedValue({ items: [], count: 0 });

    const tool = makeTool();
    const result = (await tool.execute!({}, toolContext)) as {
      data: { type: string; items: unknown[]; count: number; message: string };
      a2uiMessages: Array<{ updateDataModel?: { value: { state: string } } }>;
    };

    expect(result.data).toEqual({
      type: "reviews-grid",
      items: [],
      count: 0,
      message: "You haven't reviewed any movies yet.",
    });
    const stateUpdate = result.a2uiMessages.find((m) => m.updateDataModel);
    expect(stateUpdate?.updateDataModel?.value.state).toBe("empty");
  });

  it("service failure returns error data and a2uiMessages with state=error", async () => {
    mockList.mockRejectedValue(new Error("DB down"));

    const tool = makeTool();
    const result = (await tool.execute!({}, toolContext)) as {
      data: {
        type: string;
        items: unknown[];
        count: number;
        error: boolean;
        message: string;
      };
      a2uiMessages: Array<{ updateDataModel?: { value: { state: string } } }>;
    };

    expect(result.data).toEqual({
      type: "reviews-grid",
      items: [],
      count: 0,
      error: true,
      message:
        "Sorry, I couldn't load your reviews right now. Please try again.",
    });
    const stateUpdate = result.a2uiMessages.find((m) => m.updateDataModel);
    expect(stateUpdate?.updateDataModel?.value.state).toBe("error");
  });
});
