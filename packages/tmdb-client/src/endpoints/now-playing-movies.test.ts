import { describe, it, expect, vi, beforeEach } from "vitest";
import { TmdbClient } from "../client.js";
import { getNowPlayingMovies } from "./now-playing-movies.js";

vi.mock("../client.js", () => ({
  TmdbClient: vi.fn(),
}));

describe("getNowPlayingMovies", () => {
  let client: TmdbClient;
  const mockGet = vi.fn();

  beforeEach(() => {
    mockGet.mockReset();
    client = { get: mockGet } as unknown as TmdbClient;
  });

  it("calls /movie/now_playing with page parameter", async () => {
    const response = { page: 3, results: [], total_pages: 10, total_results: 200 };
    mockGet.mockResolvedValueOnce(response);

    const result = await getNowPlayingMovies(client, 3);

    expect(mockGet).toHaveBeenCalledWith("/movie/now_playing", { page: "3" });
    expect(result).toEqual(response);
  });

  it("defaults to page 1", async () => {
    mockGet.mockResolvedValueOnce({ page: 1, results: [], total_pages: 1, total_results: 0 });

    await getNowPlayingMovies(client);

    expect(mockGet).toHaveBeenCalledWith("/movie/now_playing", { page: "1" });
  });
});
