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
  it("movieId provided, in watchlist — returns success with affected ['watchlist']", async () => {
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
      kind: "success",
      affected: ["watchlist"],
    });
  });

  it("movieId provided, not in watchlist — returns error code not_found", async () => {
    mockIsInWatchlist.mockResolvedValue(false);

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1", movieId: "uuid-1" }, toolContext);

    expect(mockRemove).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "error", code: "not_found" });
  });

  it("title only, 1 match — returns success with affected ['watchlist']", async () => {
    const movie = fakeMovie(1);
    mockSearchByTitleInWatchlist.mockResolvedValue([movie]);
    mockRemove.mockResolvedValue({ removed: true, message: "Movie removed from watchlist" });

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1" }, toolContext);

    expect(mockSearchByTitleInWatchlist).toHaveBeenCalledWith("user-1", "Movie 1");
    expect(mockRemove).toHaveBeenCalledWith("user-1", "uuid-1");
    expect(result).toMatchObject({
      kind: "success",
      affected: ["watchlist"],
    });
    expect((result as { movie: { id: string } }).movie.id).toBe("uuid-1");
  });

  it("0 matches — returns error code not_found", async () => {
    mockSearchByTitleInWatchlist.mockResolvedValue([]);

    const tool = makeTool();
    const result = await tool.execute!({ title: "Unknown" }, toolContext);

    expect(result).toMatchObject({ kind: "error", code: "not_found" });
    expect((result as { message: string }).message).toContain("Unknown");
  });

  it("multiple matches — returns needs-clarification with candidates", async () => {
    mockSearchByTitleInWatchlist.mockResolvedValue([fakeMovie(1), fakeMovie(2)]);

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie" }, toolContext);

    expect(result).toMatchObject({ kind: "needs-clarification" });
    expect((result as { candidates: unknown[] }).candidates).toHaveLength(2);
  });

  it("service throws — returns error code service_error", async () => {
    const movie = fakeMovie(1);
    mockSearchByTitleInWatchlist.mockResolvedValue([movie]);
    mockRemove.mockRejectedValue(new Error("DB down"));

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1" }, toolContext);

    expect(result).toMatchObject({ kind: "error", code: "service_error" });
  });
});
