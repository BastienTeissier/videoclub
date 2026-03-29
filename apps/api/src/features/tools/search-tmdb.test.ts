import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@repo/tmdb-client", () => ({
  searchMovies: vi.fn(),
  getMovieDetails: vi.fn(),
  mapTmdbMovieDetails: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  moviesRepository: vi.fn(),
}));

vi.mock("../../lib/tmdb.js", () => ({
  getTmdbClient: vi.fn(() => ({})),
}));

import { searchMovies, getMovieDetails, mapTmdbMovieDetails } from "@repo/tmdb-client";
import { moviesRepository } from "@repo/db";
import { createSearchTmdbTool } from "./search-tmdb.js";

const mockSearchMovies = vi.mocked(searchMovies);
const mockGetMovieDetails = vi.mocked(getMovieDetails);
const mockMapTmdbMovieDetails = vi.mocked(mapTmdbMovieDetails);
const mockMoviesRepository = vi.mocked(moviesRepository);

const mockUpsertFromTmdb = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockMoviesRepository.mockReturnValue({
    searchByTitle: vi.fn(),
    searchStructured: vi.fn(),
    upsertFromTmdb: mockUpsertFromTmdb,
  } as ReturnType<typeof moviesRepository>);
});

function makeTool() {
  return createSearchTmdbTool({} as Parameters<typeof createSearchTmdbTool>[0]);
}

const fakeDetails = (id: number) =>
  ({
    id,
    title: `Movie ${id}`,
    release_date: "2024-01-01",
    genres: [{ id: 1, name: "Drama" }],
    credits: { cast: [], crew: [] },
    overview: "A movie",
    runtime: 120,
    original_language: "en",
    poster_path: null,
    backdrop_path: null,
    popularity: 10,
  }) as unknown as Awaited<ReturnType<typeof getMovieDetails>>;

const fakeMapped = (id: number) => ({
  tmdbId: id,
  title: `Movie ${id}`,
  year: 2024,
  synopsis: "A movie",
  genres: ["Drama"],
  cast: [],
  directors: [],
  runtime: 120,
  language: "en",
  posterUrl: null,
  backdropUrl: null,
  popularity: 10,
  releaseDate: "2024-01-01",
});

const fakeDbMovie = (id: number) => ({
  id: `uuid-${id}`,
  tmdbId: id,
  title: `Movie ${id}`,
  year: 2024,
  synopsis: "A movie",
  genres: ["Drama"],
  cast: [] as string[],
  directors: [] as string[],
  runtime: 120,
  language: "en",
  posterUrl: null,
  backdropUrl: null,
  popularity: 10,
  releaseDate: "2024-01-01",
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-01T00:00:00Z"),
});

describe("createSearchTmdbTool", () => {
  it("searches TMDB and upserts results", async () => {
    mockSearchMovies.mockResolvedValue({
      results: [{ id: 1 }, { id: 2 }],
      page: 1,
      total_pages: 1,
      total_results: 2,
    } as Awaited<ReturnType<typeof searchMovies>>);

    mockGetMovieDetails
      .mockResolvedValueOnce(fakeDetails(1))
      .mockResolvedValueOnce(fakeDetails(2));

    mockMapTmdbMovieDetails
      .mockReturnValueOnce(fakeMapped(1))
      .mockReturnValueOnce(fakeMapped(2));

    mockUpsertFromTmdb
      .mockResolvedValueOnce(fakeDbMovie(1))
      .mockResolvedValueOnce(fakeDbMovie(2));

    const tool = makeTool();
    await tool.execute({ query: "test", page: 1 }, { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal });

    expect(mockSearchMovies).toHaveBeenCalledWith(expect.anything(), "test", 1);
    expect(mockGetMovieDetails).toHaveBeenCalledTimes(2);
    expect(mockMapTmdbMovieDetails).toHaveBeenCalledTimes(2);
    expect(mockUpsertFromTmdb).toHaveBeenCalledTimes(2);
  });

  it("returns persisted movies mapped to MovieDto[] shape", async () => {
    mockSearchMovies.mockResolvedValue({
      results: [{ id: 1 }],
      page: 1,
      total_pages: 1,
      total_results: 1,
    } as Awaited<ReturnType<typeof searchMovies>>);

    mockGetMovieDetails.mockResolvedValueOnce(fakeDetails(1));
    mockMapTmdbMovieDetails.mockReturnValueOnce(fakeMapped(1));
    mockUpsertFromTmdb.mockResolvedValueOnce(fakeDbMovie(1));

    const tool = makeTool();
    const result = await tool.execute({ query: "test", page: 1 }, { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal });

    expect(Array.isArray(result)).toBe(true);
    const movies = result as Array<Record<string, unknown>>;
    expect(movies[0]).toMatchObject({
      id: "uuid-1",
      tmdbId: 1,
      title: "Movie 1",
      year: 2024,
      genres: ["Drama"],
    });
    expect(typeof movies[0]!.createdAt).toBe("string");
    expect(typeof movies[0]!.updatedAt).toBe("string");
  });

  it("returns empty array when TMDB returns no results", async () => {
    mockSearchMovies.mockResolvedValue({
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    } as Awaited<ReturnType<typeof searchMovies>>);

    const tool = makeTool();
    const result = await tool.execute({ query: "nonexistent", page: 1 }, { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal });

    expect(result).toEqual([]);
  });

  it("returns error object on TMDB API failure", async () => {
    mockSearchMovies.mockRejectedValue(new Error("TMDb API error: 500"));

    const tool = makeTool();
    const result = await tool.execute({ query: "test", page: 1 }, { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal });

    expect(result).toEqual({ error: "TMDB unavailable" });
  });

  it("has needsApproval set to true", () => {
    const tool = makeTool();
    expect(tool.needsApproval).toBe(true);
  });
});
