import type { TmdbClient } from "../client.js";
import type { TmdbMovie, TmdbPaginatedResponse } from "../types.js";

export async function getNowPlayingMovies(
  client: TmdbClient,
  page = 1
): Promise<TmdbPaginatedResponse<TmdbMovie>> {
  return client.get<TmdbPaginatedResponse<TmdbMovie>>("/movie/now_playing", {
    page: String(page),
  });
}
