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
  it("returns { data: watchlist-grid, a2uiMessages } with items and count", async () => {
    mockList.mockResolvedValue({
      items: [fakeMovie(1), fakeMovie(2), fakeMovie(3)],
      count: 3,
    });

    const tool = makeTool();
    const result = (await tool.execute!({}, toolContext)) as {
      data: { type: string; count: number; items: { id: string }[] };
      a2uiMessages: unknown[];
    };

    expect(result.data.type).toBe("watchlist-grid");
    expect(result.data.count).toBe(3);
    expect(result.data.items).toHaveLength(3);
    expect(result.data.items[0]!.id).toBe("uuid-1");
    expect(result.a2uiMessages).toHaveLength(3);
  });

  it("empty watchlist returns empty-state message in data and a2uiMessages", async () => {
    mockList.mockResolvedValue({ items: [], count: 0 });

    const tool = makeTool();
    const result = (await tool.execute!({}, toolContext)) as {
      data: { type: string; items: unknown[]; count: number; message: string };
      a2uiMessages: Array<{ updateDataModel?: { value: { state: string } } }>;
    };

    expect(result.data).toEqual({
      type: "watchlist-grid",
      items: [],
      count: 0,
      message: "Your watchlist is empty. Search for movies to get started!",
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
      type: "watchlist-grid",
      items: [],
      count: 0,
      error: true,
      message:
        "Sorry, I couldn't load your watchlist right now. Please try again.",
    });
    const stateUpdate = result.a2uiMessages.find((m) => m.updateDataModel);
    expect(stateUpdate?.updateDataModel?.value.state).toBe("error");
  });
});
