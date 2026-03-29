import type { TmdbClient } from "../client.js";
import type { TmdbMovie, TmdbPaginatedResponse } from "../types.js";

export function createMovieListEndpoint(path: string) {
  return async function (
    client: TmdbClient,
    page = 1
  ): Promise<TmdbPaginatedResponse<TmdbMovie>> {
    return client.get<TmdbPaginatedResponse<TmdbMovie>>(path, {
      page: String(page),
    });
  };
}
