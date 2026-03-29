import { createDb } from "./client/index.js";
import { moviesRepository } from "./repositories/movies.js";
import {
  TmdbClient,
  getPopularMovies,
  getTopRatedMovies,
  getTrendingMovies,
  getNowPlayingMovies,
  getUpcomingMovies,
  getMovieDetails,
  mapTmdbMovieDetails,
} from "@repo/tmdb-client";
import { loadSeedConfig } from "./seed-config.js";
import type { SeedSource } from "./seed-config.js";

const CONCURRENCY = 5;

export function fetchSourcePage(
  tmdb: TmdbClient,
  source: SeedSource,
  page: number
) {
  switch (source.type) {
    case "popular":
      return getPopularMovies(tmdb, page);
    case "top_rated":
      return getTopRatedMovies(tmdb, page);
    case "trending":
      return getTrendingMovies(tmdb, source.timeWindow, page);
    case "now_playing":
      return getNowPlayingMovies(tmdb, page);
    case "upcoming":
      return getUpcomingMovies(tmdb, page);
  }
}

async function processInBatches<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map(fn));
  }
}

export async function seedFromSources(
  tmdb: TmdbClient,
  repo: ReturnType<typeof moviesRepository>,
  sources: SeedSource[]
): Promise<number> {
  let totalSeeded = 0;

  for (const source of sources) {
    try {
      for (let page = 1; page <= source.pages; page++) {
        console.log(`[${source.type}] Page ${page}/${source.pages}...`);
        const { results } = await fetchSourcePage(tmdb, source, page);

        await processInBatches(results, CONCURRENCY, async (movie) => {
          try {
            const details = await getMovieDetails(tmdb, movie.id);
            const newMovie = mapTmdbMovieDetails(details);
            await repo.upsertFromTmdb(newMovie);
            totalSeeded++;
            console.log(`  ✓ ${newMovie.title} (${newMovie.year})`);
          } catch (error) {
            console.error(
              `  ✗ Failed to seed movie ${movie.id}: ${error}`
            );
          }
        });
      }
    } catch (error) {
      console.error(`[${source.type}] Source failed: ${error}`);
    }
  }

  return totalSeeded;
}

async function main() {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    console.error("TMDB_API_KEY environment variable is required");
    process.exit(1);
  }

  let config;
  try {
    config = loadSeedConfig();
  } catch (error) {
    console.error(`Failed to load seed config: ${error}`);
    process.exit(1);
  }

  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://videoclub:videoclub@localhost:5432/videoclub";

  const { db, client } = createDb(databaseUrl);
  const repo = moviesRepository(db);
  const tmdb = new TmdbClient(apiKey);

  try {
    const totalSeeded = await seedFromSources(tmdb, repo, config.sources);
    console.log(`\nSeeded ${totalSeeded} movies.`);
  } finally {
    await client.end();
  }
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/seed.ts");

if (isMain) {
  main();
}
