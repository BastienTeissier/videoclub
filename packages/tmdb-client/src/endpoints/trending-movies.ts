import type { TmdbClient } from "../client.js";
import type { TmdbMovie, TmdbPaginatedResponse } from "../types.js";

export async function getTrendingMovies(
  client: TmdbClient,
  timeWindow: "day" | "week",
  page = 1
): Promise<TmdbPaginatedResponse<TmdbMovie>> {
  return client.get<TmdbPaginatedResponse<TmdbMovie>>(
    `/trending/movie/${timeWindow}`,
    { page: String(page) }
  );
}
