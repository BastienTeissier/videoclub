import type { TmdbClient } from "../client.js";
import type { TmdbMovieDetails } from "../types.js";

export async function getMovieDetails(
  client: TmdbClient,
  movieId: number
): Promise<TmdbMovieDetails> {
  return client.get<TmdbMovieDetails>(`/movie/${movieId}`, {
    append_to_response: "credits",
  });
}
