import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@repo/db", () => ({
  moviesRepository: vi.fn(),
}));

vi.mock("../../services/watchlist.js", () => ({
  watchlistService: vi.fn(),
}));

import { moviesRepository } from "@repo/db";
import { watchlistService } from "../../services/watchlist.js";
import { createWatchlistAddTool } from "./watchlist-add.js";

const mockFindById = vi.fn();
const mockSearchStructured = vi.fn();
const mockAdd = vi.fn();

const mockMoviesRepository = vi.mocked(moviesRepository);
const mockWatchlistService = vi.mocked(watchlistService);

beforeEach(() => {
  vi.clearAllMocks();
  mockMoviesRepository.mockReturnValue({
    findById: mockFindById,
    findByIds: vi.fn(),
    searchByTitle: vi.fn(),
    searchStructured: mockSearchStructured,
    upsertFromTmdb: vi.fn(),
  } as ReturnType<typeof moviesRepository>);
  mockWatchlistService.mockReturnValue({
    add: mockAdd,
    remove: vi.fn(),
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
  return createWatchlistAddTool(
    {} as Parameters<typeof createWatchlistAddTool>[0],
    "user-1",
  );
}

const toolContext = {
  toolCallId: "tc1",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("createWatchlistAddTool", () => {
  it("movieId provided — returns success with affected ['watchlist']", async () => {
    const movie = fakeMovie(1);
    mockFindById.mockResolvedValue(movie);
    mockAdd.mockResolvedValue({ added: true, message: "Movie 1 added to watchlist" });

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1", movieId: "uuid-1" }, toolContext);

    expect(mockFindById).toHaveBeenCalledWith("uuid-1");
    expect(mockSearchStructured).not.toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledWith("user-1", "uuid-1");
    expect(result).toMatchObject({
      kind: "success",
      affected: ["watchlist"],
      message: "Movie 1 added to watchlist",
    });
    expect((result as { movie: { id: string } }).movie.id).toBe("uuid-1");
  });

  it("title only, 1 match — returns success with affected ['watchlist']", async () => {
    const movie = fakeMovie(1);
    mockSearchStructured.mockResolvedValue([movie]);
    mockAdd.mockResolvedValue({ added: true, message: "Movie 1 added to watchlist" });

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1" }, toolContext);

    expect(mockSearchStructured).toHaveBeenCalledWith({ title: "Movie 1" });
    expect(mockAdd).toHaveBeenCalledWith("user-1", "uuid-1");
    expect(result).toMatchObject({
      kind: "success",
      affected: ["watchlist"],
    });
    expect((result as { movie: { id: string } }).movie.id).toBe("uuid-1");
  });

  it("1 match, already in watchlist — still returns success (idempotent) with the service message", async () => {
    const movie = fakeMovie(1);
    mockSearchStructured.mockResolvedValue([movie]);
    mockAdd.mockResolvedValue({ added: false, message: "Movie 1 is already in your watchlist" });

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1" }, toolContext);

    expect(result).toMatchObject({
      kind: "success",
      affected: ["watchlist"],
      message: "Movie 1 is already in your watchlist",
    });
  });

  it("0 matches — returns error code not_found telling user to search first", async () => {
    mockSearchStructured.mockResolvedValue([]);

    const tool = makeTool();
    const result = await tool.execute!({ title: "Unknown" }, toolContext);

    expect(result).toMatchObject({ kind: "error", code: "not_found" });
    expect((result as { message: string }).message).toContain("Unknown");
    expect((result as { message: string }).message).toContain("Search for it first");
  });

  it("multiple matches — returns needs-clarification with candidates", async () => {
    mockSearchStructured.mockResolvedValue([fakeMovie(1), fakeMovie(2), fakeMovie(3)]);

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie" }, toolContext);

    expect(result).toMatchObject({ kind: "needs-clarification" });
    expect((result as { candidates: unknown[] }).candidates).toHaveLength(3);
  });

  it("service throws — returns error code service_error", async () => {
    const movie = fakeMovie(1);
    mockSearchStructured.mockResolvedValue([movie]);
    mockAdd.mockRejectedValue(new Error("DB down"));

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1" }, toolContext);

    expect(result).toMatchObject({ kind: "error", code: "service_error" });
  });
});
