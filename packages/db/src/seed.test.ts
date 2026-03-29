import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchSourcePage } from "./seed.js";
import type { SeedSource } from "./seed-config.js";
import type { TmdbClient } from "@repo/tmdb-client";

vi.mock("@repo/tmdb-client", () => ({
  getPopularMovies: vi.fn().mockResolvedValue({ results: [] }),
  getTopRatedMovies: vi.fn().mockResolvedValue({ results: [] }),
  getTrendingMovies: vi.fn().mockResolvedValue({ results: [] }),
  getNowPlayingMovies: vi.fn().mockResolvedValue({ results: [] }),
  getUpcomingMovies: vi.fn().mockResolvedValue({ results: [] }),
}));

import {
  getPopularMovies,
  getTopRatedMovies,
  getTrendingMovies,
  getNowPlayingMovies,
  getUpcomingMovies,
} from "@repo/tmdb-client";

describe("fetchSourcePage", () => {
  const tmdb = {} as TmdbClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes all configured sources", async () => {
    const sources: SeedSource[] = [
      { type: "popular", pages: 2 },
      { type: "top_rated", pages: 1 },
      { type: "trending", timeWindow: "week", pages: 1 },
    ];

    for (const source of sources) {
      await fetchSourcePage(tmdb, source, 1);
    }

    expect(getPopularMovies).toHaveBeenCalledWith(tmdb, 1);
    expect(getTopRatedMovies).toHaveBeenCalledWith(tmdb, 1);
    expect(getTrendingMovies).toHaveBeenCalledWith(tmdb, "week", 1);
  });

  it("continues on source failure", async () => {
    vi.mocked(getPopularMovies).mockRejectedValueOnce(new Error("API error"));

    const sources: SeedSource[] = [
      { type: "popular", pages: 1 },
      { type: "top_rated", pages: 1 },
    ];

    // First source throws
    await expect(fetchSourcePage(tmdb, sources[0]!, 1)).rejects.toThrow("API error");

    // Second source still works
    const result = await fetchSourcePage(tmdb, sources[1]!, 1);
    expect(result).toEqual({ results: [] });
    expect(getTopRatedMovies).toHaveBeenCalledWith(tmdb, 1);
  });

  it("calls fetchSourcePage with correct dispatcher for each type", async () => {
    const allSources: SeedSource[] = [
      { type: "popular", pages: 1 },
      { type: "top_rated", pages: 1 },
      { type: "trending", timeWindow: "day", pages: 1 },
      { type: "now_playing", pages: 1 },
      { type: "upcoming", pages: 1 },
    ];

    for (const source of allSources) {
      await fetchSourcePage(tmdb, source, 1);
    }

    expect(getPopularMovies).toHaveBeenCalledOnce();
    expect(getTopRatedMovies).toHaveBeenCalledOnce();
    expect(getTrendingMovies).toHaveBeenCalledWith(tmdb, "day", 1);
    expect(getNowPlayingMovies).toHaveBeenCalledOnce();
    expect(getUpcomingMovies).toHaveBeenCalledOnce();
  });
});
