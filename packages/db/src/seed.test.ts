import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchSourcePage, seedFromSources } from "./seed.js";
import type { SeedSource } from "./seed-config.js";
import type { TmdbClient } from "@repo/tmdb-client";

vi.mock("@repo/tmdb-client", () => ({
  getPopularMovies: vi.fn().mockResolvedValue({ results: [] }),
  getTopRatedMovies: vi.fn().mockResolvedValue({ results: [] }),
  getTrendingMovies: vi.fn().mockResolvedValue({ results: [] }),
  getNowPlayingMovies: vi.fn().mockResolvedValue({ results: [] }),
  getUpcomingMovies: vi.fn().mockResolvedValue({ results: [] }),
  getMovieDetails: vi.fn(),
  mapTmdbMovieDetails: vi.fn(),
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

describe("seedFromSources", () => {
  const tmdb = {} as TmdbClient;
  const mockRepo = {
    upsertFromTmdb: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continues processing remaining sources when one source fails", async () => {
    vi.mocked(getPopularMovies).mockRejectedValueOnce(new Error("API error"));
    vi.mocked(getTopRatedMovies).mockResolvedValueOnce({ results: [], page: 1, total_pages: 1, total_results: 0 });

    const sources: SeedSource[] = [
      { type: "popular", pages: 1 },
      { type: "top_rated", pages: 1 },
    ];

    await seedFromSources(tmdb, mockRepo, sources);

    expect(getPopularMovies).toHaveBeenCalledOnce();
    expect(getTopRatedMovies).toHaveBeenCalledOnce();
  });
});
