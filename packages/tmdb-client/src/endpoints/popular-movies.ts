import type { TmdbClient } from "../client.js";
import type { TmdbMovie, TmdbPaginatedResponse } from "../types.js";

export async function getPopularMovies(
  client: TmdbClient,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbMovie>> {
  return client.get<TmdbPaginatedResponse<TmdbMovie>>("/movie/popular", {
    page: String(page),
  });
}
