import { createDb } from "./client/index.js";
import { moviesRepository } from "./repositories/movies.js";
import type { NewMovie } from "./schema/movies.js";
import {
  TmdbClient,
  getPopularMovies,
  getMovieDetails,
} from "@repo/tmdb-client";
import type { TmdbMovieDetails } from "@repo/tmdb-client";

const TOTAL_PAGES = 10;

export function mapTmdbToNewMovie(details: TmdbMovieDetails): NewMovie {
  const year = details.release_date
    ? parseInt(details.release_date.split("-")[0]!, 10)
    : null;

  const directors = details.credits.crew
    .filter((c) => c.job === "Director")
    .map((c) => c.name);

  const cast = details.credits.cast
    .sort((a, b) => a.order - b.order)
    .slice(0, 10)
    .map((c) => c.name);

  return {
    tmdbId: details.id,
    title: details.title,
    year: isNaN(year ?? NaN) ? null : year,
    synopsis: details.overview || null,
    genres: details.genres.map((g) => g.name),
    cast,
    directors,
    runtime: details.runtime,
    language: details.original_language,
    posterUrl: details.poster_path,
    backdropUrl: details.backdrop_path,
    popularity: details.popularity,
    releaseDate: details.release_date || null,
  };
}

async function main() {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    console.error("TMDB_API_KEY environment variable is required");
    process.exit(1);
  }

  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://videoclub:videoclub@localhost:5432/videoclub";

  const { db, client } = createDb(databaseUrl);
  const repo = moviesRepository(db);
  const tmdb = new TmdbClient(apiKey);

  let totalSeeded = 0;

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    console.log(`Fetching popular movies page ${page}/${TOTAL_PAGES}...`);
    const { results } = await getPopularMovies(tmdb, page);

    for (const movie of results) {
      try {
        const details = await getMovieDetails(tmdb, movie.id);
        const newMovie = mapTmdbToNewMovie(details);
        await repo.upsertFromTmdb(newMovie);
        totalSeeded++;
        console.log(`  ✓ ${newMovie.title} (${newMovie.year})`);
      } catch (error) {
        console.error(`  ✗ Failed to seed movie ${movie.id}: ${error}`);
      }
    }
  }

  console.log(`\nSeeded ${totalSeeded} movies.`);
  await client.end();
}

if (process.argv[1]?.includes("seed")) {
  main();
}
