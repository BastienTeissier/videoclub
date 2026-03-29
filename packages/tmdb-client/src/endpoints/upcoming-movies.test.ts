import { describe, it, expect, vi, beforeEach } from "vitest";
import { TmdbClient } from "../client.js";
import { getUpcomingMovies } from "./upcoming-movies.js";

vi.mock("../client.js", () => ({
  TmdbClient: vi.fn(),
}));

describe("getUpcomingMovies", () => {
  let client: TmdbClient;
  const mockGet = vi.fn();

  beforeEach(() => {
    mockGet.mockReset();
    client = { get: mockGet } as unknown as TmdbClient;
  });

  it("calls /movie/upcoming with page parameter", async () => {
    const response = { page: 1, results: [], total_pages: 5, total_results: 100 };
    mockGet.mockResolvedValueOnce(response);

    const result = await getUpcomingMovies(client, 1);

    expect(mockGet).toHaveBeenCalledWith("/movie/upcoming", { page: "1" });
    expect(result).toEqual(response);
  });

  it("defaults to page 1", async () => {
    mockGet.mockResolvedValueOnce({ page: 1, results: [], total_pages: 1, total_results: 0 });

    await getUpcomingMovies(client);

    expect(mockGet).toHaveBeenCalledWith("/movie/upcoming", { page: "1" });
  });
});
