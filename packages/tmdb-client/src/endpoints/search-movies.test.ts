import { describe, it, expect, vi, beforeEach } from "vitest";
import { TmdbClient } from "../client.js";
import { searchMovies } from "./search-movies.js";

vi.mock("../client.js", () => ({
  TmdbClient: vi.fn(),
}));

describe("searchMovies", () => {
  let client: TmdbClient;
  const mockGet = vi.fn();

  beforeEach(() => {
    mockGet.mockReset();
    client = { get: mockGet } as unknown as TmdbClient;
  });

  it("calls /search/movie with query and page", async () => {
    const response = { page: 1, results: [], total_pages: 1, total_results: 0 };
    mockGet.mockResolvedValueOnce(response);

    const result = await searchMovies(client, "inception", 3);

    expect(mockGet).toHaveBeenCalledWith("/search/movie", {
      query: "inception",
      page: "3",
    });
    expect(result).toEqual(response);
  });

  it("defaults to page 1", async () => {
    mockGet.mockResolvedValueOnce({ page: 1, results: [], total_pages: 1, total_results: 0 });

    await searchMovies(client, "matrix");

    expect(mockGet).toHaveBeenCalledWith("/search/movie", {
      query: "matrix",
      page: "1",
    });
  });
});
