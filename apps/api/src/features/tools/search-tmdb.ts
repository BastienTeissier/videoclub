import { tool } from "ai";
import { z } from "zod";
import { moviesRepository } from "@repo/db";
import type { Database } from "@repo/db";
import type { MovieDto } from "@repo/contracts";
import { searchMovies, getMovieDetails, mapTmdbMovieDetails } from "@repo/tmdb-client";
import { getTmdbClient } from "../../lib/tmdb.js";

function movieToDto(movie: {
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  synopsis: string | null;
  genres: string[] | null;
  cast: string[] | null;
  directors: string[] | null;
  runtime: number | null;
  language: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  popularity: number | null;
  releaseDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MovieDto {
  return {
    id: movie.id,
    tmdbId: movie.tmdbId,
    title: movie.title,
    year: movie.year,
    synopsis: movie.synopsis,
    genres: movie.genres,
    cast: movie.cast,
    directors: movie.directors,
    runtime: movie.runtime,
    language: movie.language,
    posterUrl: movie.posterUrl,
    backdropUrl: movie.backdropUrl,
    popularity: movie.popularity,
    releaseDate: movie.releaseDate,
    createdAt: movie.createdAt.toISOString(),
    updatedAt: movie.updatedAt.toISOString(),
  };
}

export function createSearchTmdbTool(db: Database) {
  const repo = moviesRepository(db);

  return tool({
    description:
      "Search TMDB for movies when local results are insufficient. Fetches full details and persists results to the local database.",
    needsApproval: true,
    inputSchema: z.object({
      query: z.string().describe("Search query for TMDB"),
      page: z.number().optional().default(1).describe("Page number"),
    }),
    execute: async (input) => {
      try {
        const client = getTmdbClient();
        const searchResult = await searchMovies(client, input.query, input.page);
        const results = searchResult.results.slice(0, 10);

        if (results.length === 0) {
          return [];
        }

        const details = await Promise.all(
          results.map((r) => getMovieDetails(client, r.id))
        );

        const persisted: MovieDto[] = [];
        for (const detail of details) {
          const mapped = mapTmdbMovieDetails(detail);
          const movie = await repo.upsertFromTmdb(mapped);
          persisted.push(movieToDto(movie));
        }

        return persisted;
      } catch (error) {
        if (error instanceof Error && error.message.includes("TMDb API error")) {
          return { error: "TMDB unavailable" };
        }
        return { error: "TMDB unavailable" };
      }
    },
  });
}
