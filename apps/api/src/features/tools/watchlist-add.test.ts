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
  it("movieId provided — skips search, calls service.add directly", async () => {
    const movie = fakeMovie(1);
    mockFindById.mockResolvedValue(movie);
    mockAdd.mockResolvedValue({ added: true, message: "Movie 1 added to watchlist" });

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1", movieId: "uuid-1" }, toolContext);

    expect(mockFindById).toHaveBeenCalledWith("uuid-1");
    expect(mockSearchStructured).not.toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledWith("user-1", "uuid-1");
    expect(result).toMatchObject({
      added: true,
      movieId: "uuid-1",
    });
    expect((result as { movie: { id: string } }).movie.id).toBe("uuid-1");
  });

  it("title only, 1 match — calls service.add, returns added result", async () => {
    const movie = fakeMovie(1);
    mockSearchStructured.mockResolvedValue([movie]);
    mockAdd.mockResolvedValue({ added: true, message: "Movie 1 added to watchlist" });

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1" }, toolContext);

    expect(mockSearchStructured).toHaveBeenCalledWith({ title: "Movie 1" });
    expect(mockAdd).toHaveBeenCalledWith("user-1", "uuid-1");
    expect(result).toMatchObject({
      added: true,
      movieId: "uuid-1",
    });
    expect((result as { movie: { id: string } }).movie.id).toBe("uuid-1");
  });

  it("1 match, already in watchlist — returns added:false with info message", async () => {
    const movie = fakeMovie(1);
    mockSearchStructured.mockResolvedValue([movie]);
    mockAdd.mockResolvedValue({ added: false, message: "Movie 1 is already in your watchlist" });

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1" }, toolContext);

    expect(result).toMatchObject({
      added: false,
      message: "Movie 1 is already in your watchlist",
    });
  });

  it("0 matches — returns not_found info result telling user to search first", async () => {
    mockSearchStructured.mockResolvedValue([]);

    const tool = makeTool();
    const result = await tool.execute!({ title: "Unknown" }, toolContext);

    expect(result).toMatchObject({
      error: "not_found",
    });
    expect((result as { message: string }).message).toContain("Unknown");
    expect((result as { message: string }).message).toContain("Search for it first");
  });

  it("multiple matches — returns clarification_needed with add action and candidates", async () => {
    mockSearchStructured.mockResolvedValue([fakeMovie(1), fakeMovie(2), fakeMovie(3)]);

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie" }, toolContext);

    expect(result).toMatchObject({
      clarification_needed: true,
      action: "add",
    });
    expect((result as { candidates: unknown[] }).candidates).toHaveLength(3);
  });

  it("service throws — returns error message", async () => {
    const movie = fakeMovie(1);
    mockSearchStructured.mockResolvedValue([movie]);
    mockAdd.mockRejectedValue(new Error("DB down"));

    const tool = makeTool();
    const result = await tool.execute!({ title: "Movie 1" }, toolContext);

    expect(result).toMatchObject({
      error: "service_error",
    });
  });
});
