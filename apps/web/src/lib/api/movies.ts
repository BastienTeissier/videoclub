import type { MovieSearchResponse } from "@repo/contracts";
import { apiFetch } from "./client.js";

export async function searchMovies(
  query: string
): Promise<MovieSearchResponse> {
  return apiFetch<MovieSearchResponse>(
    `/api/v1/movies/search?q=${encodeURIComponent(query)}`
  );
}
