import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@repo/db", () => ({
  watchlistRepository: vi.fn(),
  moviesRepository: vi.fn(),
}));

vi.mock("../../services/watchlist.js", () => ({
  watchlistService: vi.fn(),
}));

import { watchlistRepository, moviesRepository } from "@repo/db";
import { watchlistService } from "../../services/watchlist.js";
import { createWatchlistRemoveTool } from "./watchlist-remove.js";

const mockIsInWatchlist = vi.fn();
const mockSearchByTitleInWatchlist = vi.fn();
const mockFindById = vi.fn();
const mockRemove = vi.fn();

const mockWatchlistRepository = vi.mocked(watchlistRepository);
const mockMoviesRepository = vi.mocked(moviesRepository);
const mockWatchlistService = vi.mocked(watchlistService);

beforeEach(() => {
  vi.clearAllMocks();
  mockWatchlistRepository.mockReturnValue({
    add: vi.fn(),
    remove: vi.fn(),
    listByUser: vi.fn(),
    isInWatchlist: mockIsInWatchlist,
    getWatchlistedMovieIds: vi.fn(),
    searchByTitleInWatchlist: mockSearchByTitleInWatchlist,
  } as ReturnType<typeof watchlistRepository>);
  mockMoviesRepository.mockReturnValue({
    findById: mockFindById,
    searchByTitle: vi.fn(),
    searchStructured: vi.fn(),
    upsertFromTmdb: vi.fn(),
  } as ReturnType<typeof moviesRepository>);
  mockWatchlistService.mockReturnValue({
    add: vi.fn(),
    remove: mockRemove,
    list: vi.fn(),
    getWatchlistedIds: vi.fn(),
  } as ReturnType<typeof watchlistService>);
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

function makeTool() {
  return createWatchlistRemoveTool(
    {} as Parameters<typeof createWatchlistRemoveTool>[0],
    "user-1",
  );
}

const toolContext = {
  toolCallId: "tc1",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("createWatchlistRemoveTool", () => {
  it("movieId provided — skips search, calls service.remove directly", async () => {
    const movie = fakeMovie(1);
    mockIsInWatchlist.mockResolvedValue(true);
    mockFindById.mockResolvedValue(movie);
    mockRemove.mockResolvedValue({ removed: true, message: "Movie removed from watchlist" });

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1", movieId: "uuid-1" }, toolContext);

    expect(mockIsInWatchlist).toHaveBeenCalledWith("user-1", "uuid-1");
    expect(mockSearchByTitleInWatchlist).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith("user-1", "uuid-1");
    expect(result).toMatchObject({
      removed: true,
      movieId: "uuid-1",
    });
  });

  it("title only, 1 match — calls service.remove, returns removed result", async () => {
    const movie = fakeMovie(1);
    mockSearchByTitleInWatchlist.mockResolvedValue([movie]);
    mockRemove.mockResolvedValue({ removed: true, message: "Movie removed from watchlist" });

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1" }, toolContext);

    expect(mockSearchByTitleInWatchlist).toHaveBeenCalledWith("user-1", "Movie 1");
    expect(mockRemove).toHaveBeenCalledWith("user-1", "uuid-1");
    expect(result).toMatchObject({
      removed: true,
      movieId: "uuid-1",
    });
    expect((result as { movie: { id: string } }).movie.id).toBe("uuid-1");
  });

  it("0 matches — returns not_in_watchlist error", async () => {
    mockSearchByTitleInWatchlist.mockResolvedValue([]);

    const tool = makeTool();
    const result = await tool.execute!({ title: "Unknown" }, toolContext);

    expect(result).toMatchObject({
      error: "not_in_watchlist",
    });
    expect((result as { message: string }).message).toContain("Unknown");
  });

  it("multiple matches — returns clarification_needed with remove action", async () => {
    mockSearchByTitleInWatchlist.mockResolvedValue([fakeMovie(1), fakeMovie(2)]);

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie" }, toolContext);

    expect(result).toMatchObject({
      clarification_needed: true,
      action: "remove",
    });
    expect((result as { candidates: unknown[] }).candidates).toHaveLength(2);
  });

  it("service throws — returns error message", async () => {
    const movie = fakeMovie(1);
    mockSearchByTitleInWatchlist.mockResolvedValue([movie]);
    mockRemove.mockRejectedValue(new Error("DB down"));

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1" }, toolContext);

    expect(result).toMatchObject({
      error: "service_error",
    });
  });
});
