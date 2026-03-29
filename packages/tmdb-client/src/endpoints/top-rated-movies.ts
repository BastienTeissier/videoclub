import type { TmdbClient } from "../client.js";
import type { TmdbMovie, TmdbPaginatedResponse } from "../types.js";

export async function getTopRatedMovies(
  client: TmdbClient,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbMovie>> {
  return client.get<TmdbPaginatedResponse<TmdbMovie>>("/movie/top_rated", {
    page: String(page),
  });
}
