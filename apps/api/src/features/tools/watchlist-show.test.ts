import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/watchlist.js", () => ({
  watchlistService: vi.fn(),
}));

import { watchlistService } from "../../services/watchlist.js";
import { createWatchlistShowTool } from "./watchlist-show.js";

const mockList = vi.fn();
const mockWatchlistService = vi.mocked(watchlistService);

beforeEach(() => {
  vi.clearAllMocks();
  mockWatchlistService.mockReturnValue({
    add: vi.fn(),
    remove: vi.fn(),
    list: mockList,
    getWatchlistedIds: vi.fn(),
  } as ReturnType<typeof watchlistService>);
});

function makeTool() {
  return createWatchlistShowTool(
    {} as Parameters<typeof createWatchlistShowTool>[0],
    "user-1",
  );
}

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

const toolContext = {
  toolCallId: "tc1",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("createWatchlistShowTool", () => {
  it("returns watchlist-grid surface with items and count", async () => {
    mockList.mockResolvedValue({
      items: [fakeMovie(1), fakeMovie(2), fakeMovie(3)],
      count: 3,
    });

    const tool = makeTool();
    const result = await tool.execute!({}, toolContext);

    expect(result).toMatchObject({
      type: "watchlist-grid",
      count: 3,
    });
    expect((result as { items: unknown[] }).items).toHaveLength(3);
    expect((result as { items: Array<{ id: string }> }).items[0]!.id).toBe(
      "uuid-1",
    );
  });

  it("empty watchlist returns empty-state message", async () => {
    mockList.mockResolvedValue({ items: [], count: 0 });

    const tool = makeTool();
    const result = await tool.execute!({}, toolContext);

    expect(result).toEqual({
      type: "watchlist-grid",
      items: [],
      count: 0,
      message: "Your watchlist is empty. Search for movies to get started!",
    });
  });

  it("service failure returns watchlist error message", async () => {
    mockList.mockRejectedValue(new Error("DB down"));

    const tool = makeTool();
    const result = await tool.execute!({}, toolContext);

    expect(result).toEqual({
      type: "watchlist-grid",
      items: [],
      count: 0,
      error: true,
      message:
        "Sorry, I couldn't load your watchlist right now. Please try again.",
    });
  });

  it("result type is always watchlist-grid", async () => {
    // success
    mockList.mockResolvedValue({
      items: [fakeMovie(1)],
      count: 1,
    });
    const tool = makeTool();
    const success = await tool.execute!({}, toolContext);
    expect((success as { type: string }).type).toBe("watchlist-grid");

    // empty
    mockList.mockResolvedValue({ items: [], count: 0 });
    const empty = await tool.execute!({}, toolContext);
    expect((empty as { type: string }).type).toBe("watchlist-grid");

    // error
    mockList.mockRejectedValue(new Error("fail"));
    const error = await tool.execute!({}, toolContext);
    expect((error as { type: string }).type).toBe("watchlist-grid");
  });
});
