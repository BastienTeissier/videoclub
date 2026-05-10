import { moviesRepository } from "@repo/db";
import type { Database, Movie } from "@repo/db";

export interface SearchMoviesFilters {
  title?: string;
  director?: string;
  actor?: string;
  genres?: string[];
  excludedGenres?: string[];
  year?: number;
  maxRuntime?: number;
}

export async function searchMoviesData(
  db: Database,
  filters: SearchMoviesFilters,
): Promise<Movie[]> {
  const repo = moviesRepository(db);
  return repo.searchStructured(filters);
}
