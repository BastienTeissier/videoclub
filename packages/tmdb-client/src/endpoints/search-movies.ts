import type { TmdbClient } from "../client.js";
import type { TmdbMovie, TmdbPaginatedResponse } from "../types.js";

export async function searchMovies(
  client: TmdbClient,
  query: string,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbMovie>> {
  return client.get<TmdbPaginatedResponse<TmdbMovie>>("/search/movie", {
    query,
    page: String(page),
  });
}
