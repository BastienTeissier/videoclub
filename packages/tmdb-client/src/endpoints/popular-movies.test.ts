import { describe, it, expect, vi, beforeEach } from "vitest";
import { TmdbClient } from "../client.js";
import { getPopularMovies } from "./popular-movies.js";

vi.mock("../client.js", () => ({
  TmdbClient: vi.fn(),
}));

describe("getPopularMovies", () => {
  let client: TmdbClient;
  const mockGet = vi.fn();

  beforeEach(() => {
    mockGet.mockReset();
    client = { get: mockGet } as unknown as TmdbClient;
  });

  it("calls /movie/popular with page parameter", async () => {
    const response = { page: 2, results: [], total_pages: 10, total_results: 200 };
    mockGet.mockResolvedValueOnce(response);

    const result = await getPopularMovies(client, 2);

    expect(mockGet).toHaveBeenCalledWith("/movie/popular", { page: "2" });
    expect(result).toEqual(response);
  });

  it("defaults to page 1", async () => {
    mockGet.mockResolvedValueOnce({ page: 1, results: [], total_pages: 1, total_results: 0 });

    await getPopularMovies(client);

    expect(mockGet).toHaveBeenCalledWith("/movie/popular", { page: "1" });
  });
});
