import { describe, it, expect, vi, beforeEach } from "vitest";
import { TmdbClient } from "../client.js";
import { getTrendingMovies } from "./trending-movies.js";

vi.mock("../client.js", () => ({
  TmdbClient: vi.fn(),
}));

describe("getTrendingMovies", () => {
  let client: TmdbClient;
  const mockGet = vi.fn();

  beforeEach(() => {
    mockGet.mockReset();
    client = { get: mockGet } as unknown as TmdbClient;
  });

  it("calls /trending/movie/{timeWindow} with page parameter", async () => {
    const response = { page: 1, results: [], total_pages: 5, total_results: 100 };
    mockGet.mockResolvedValueOnce(response);

    const result = await getTrendingMovies(client, "week", 1);

    expect(mockGet).toHaveBeenCalledWith("/trending/movie/week", { page: "1" });
    expect(result).toEqual(response);
  });

  it("supports day time window", async () => {
    mockGet.mockResolvedValueOnce({ page: 1, results: [], total_pages: 1, total_results: 0 });

    await getTrendingMovies(client, "day", 1);

    expect(mockGet).toHaveBeenCalledWith("/trending/movie/day", { page: "1" });
  });

  it("defaults to page 1", async () => {
    mockGet.mockResolvedValueOnce({ page: 1, results: [], total_pages: 1, total_results: 0 });

    await getTrendingMovies(client, "week");

    expect(mockGet).toHaveBeenCalledWith("/trending/movie/week", { page: "1" });
  });
});
