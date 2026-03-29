import { describe, it, expect, vi, beforeEach } from "vitest";
import { TmdbClient } from "../client.js";
import { getTopRatedMovies } from "./top-rated-movies.js";

vi.mock("../client.js", () => ({
  TmdbClient: vi.fn(),
}));

describe("getTopRatedMovies", () => {
  let client: TmdbClient;
  const mockGet = vi.fn();

  beforeEach(() => {
    mockGet.mockReset();
    client = { get: mockGet } as unknown as TmdbClient;
  });

  it("calls /movie/top_rated with page parameter", async () => {
    const response = { page: 2, results: [], total_pages: 10, total_results: 200 };
    mockGet.mockResolvedValueOnce(response);

    const result = await getTopRatedMovies(client, 2);

    expect(mockGet).toHaveBeenCalledWith("/movie/top_rated", { page: "2" });
    expect(result).toEqual(response);
  });

  it("defaults to page 1", async () => {
    mockGet.mockResolvedValueOnce({ page: 1, results: [], total_pages: 1, total_results: 0 });

    await getTopRatedMovies(client);

    expect(mockGet).toHaveBeenCalledWith("/movie/top_rated", { page: "1" });
  });
});
