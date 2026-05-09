import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Database } from "../client/index.js";
import { moviesRepository } from "./movies.js";
import type { NewMovie } from "../schema/movies.js";
import type postgres from "postgres";

let container: StartedPostgreSqlContainer;
let db: Database;
let client: postgres.Sql;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();

  const connectionString = container.getConnectionUri();
  const result = createDb(connectionString);
  db = result.db;
  client = result.client;

  await migrate(db, { migrationsFolder: "./drizzle" });
}, 60000);

afterAll(async () => {
  await client.end();
  await container.stop();
});

const sampleMovie: NewMovie = {
  tmdbId: 203801,
  title: "Arrival",
  year: 2016,
  synopsis: "A linguist recruited by the military to communicate with alien lifeforms.",
  genres: ["Drama", "Science Fiction"],
  cast: ["Amy Adams", "Jeremy Renner"],
  directors: ["Denis Villeneuve"],
  runtime: 116,
  language: "en",
  posterUrl: "/x2FJsXjr3ey5qKJMu1EHTlhOE72.jpg",
  backdropUrl: null,
  popularity: 42.5,
  releaseDate: "2016-11-11",
};

describe("moviesRepository", () => {
  it("upserts a movie and searches by title", async () => {
    const repo = moviesRepository(db);

    const inserted = await repo.upsertFromTmdb(sampleMovie);
    expect(inserted.title).toBe("Arrival");
    expect(inserted.tmdbId).toBe(203801);

    const results = await repo.searchByTitle("Arrival");
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Arrival");
  });

  it("upserts updates existing movie on conflict", async () => {
    const repo = moviesRepository(db);

    const updated = await repo.upsertFromTmdb({
      ...sampleMovie,
      synopsis: "Updated synopsis",
    });

    expect(updated.synopsis).toBe("Updated synopsis");

    const results = await repo.searchByTitle("Arrival");
    expect(results).toHaveLength(1);
  });

  it("returns empty array for no matches", async () => {
    const repo = moviesRepository(db);
    const results = await repo.searchByTitle("NonExistentMovie12345");
    expect(results).toHaveLength(0);
  });

  it("searchStructured by director returns matching movies", async () => {
    const repo = moviesRepository(db);

    await repo.upsertFromTmdb({
      tmdbId: 100,
      title: "Jaws",
      year: 1975,
      genres: ["Thriller"],
      directors: ["Steven Spielberg"],
      cast: ["Roy Scheider"],
      popularity: 80,
      synopsis: null,
      runtime: null,
      language: null,
      posterUrl: null,
      backdropUrl: null,
      releaseDate: null,
    });

    const results = await repo.searchStructured({ director: "Spielberg" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((m) => m.title === "Jaws")).toBe(true);
  });

  it("searchStructured combines title + genre with AND", async () => {
    const repo = moviesRepository(db);

    await repo.upsertFromTmdb({
      tmdbId: 200,
      title: "Blade Runner",
      year: 1982,
      genres: ["Science Fiction"],
      directors: ["Ridley Scott"],
      cast: ["Harrison Ford"],
      popularity: 70,
      synopsis: null,
      runtime: null,
      language: null,
      posterUrl: null,
      backdropUrl: null,
      releaseDate: null,
    });

    const results = await repo.searchStructured({
      title: "Blade",
      genre: "Science Fiction",
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((m) => m.title === "Blade Runner")).toBe(true);

    const noResults = await repo.searchStructured({
      title: "Blade",
      genre: "Comedy",
    });
    expect(noResults).toHaveLength(0);
  });

  it("searchStructured with genres array matches any of the listed genres", async () => {
    const repo = moviesRepository(db);

    await repo.upsertFromTmdb({
      tmdbId: 300,
      title: "Bridesmaids",
      year: 2011,
      genres: ["Comedy"],
      directors: ["Paul Feig"],
      cast: ["Kristen Wiig"],
      popularity: 60,
      synopsis: null,
      runtime: 125,
      language: null,
      posterUrl: null,
      backdropUrl: null,
      releaseDate: null,
    });

    const results = await repo.searchStructured({
      genres: ["Comedy", "Romance"],
    });
    expect(results.some((m) => m.title === "Bridesmaids")).toBe(true);
  });

  it("searchStructured with excludedGenres filters them out", async () => {
    const repo = moviesRepository(db);

    await repo.upsertFromTmdb({
      tmdbId: 301,
      title: "The Conjuring",
      year: 2013,
      genres: ["Horror"],
      directors: ["James Wan"],
      cast: ["Vera Farmiga"],
      popularity: 55,
      synopsis: null,
      runtime: 112,
      language: null,
      posterUrl: null,
      backdropUrl: null,
      releaseDate: null,
    });

    const results = await repo.searchStructured({
      excludedGenres: ["Horror"],
    });
    expect(results.some((m) => m.title === "The Conjuring")).toBe(false);
  });

  it("findByIds preserves caller order", async () => {
    const repo = moviesRepository(db);
    const a = await repo.upsertFromTmdb({
      tmdbId: 9001,
      title: "Order A",
      year: 2001,
      genres: ["Drama"],
      directors: ["A"],
      cast: [],
      popularity: 1,
      synopsis: null,
      runtime: 90,
      language: null,
      posterUrl: null,
      backdropUrl: null,
      releaseDate: null,
    });
    const b = await repo.upsertFromTmdb({
      tmdbId: 9002,
      title: "Order B",
      year: 2002,
      genres: ["Drama"],
      directors: ["B"],
      cast: [],
      popularity: 2,
      synopsis: null,
      runtime: 90,
      language: null,
      posterUrl: null,
      backdropUrl: null,
      releaseDate: null,
    });
    const c = await repo.upsertFromTmdb({
      tmdbId: 9003,
      title: "Order C",
      year: 2003,
      genres: ["Drama"],
      directors: ["C"],
      cast: [],
      popularity: 3,
      synopsis: null,
      runtime: 90,
      language: null,
      posterUrl: null,
      backdropUrl: null,
      releaseDate: null,
    });

    const result = await repo.findByIds([c.id, a.id, b.id]);
    expect(result.map((m) => m.title)).toEqual(["Order C", "Order A", "Order B"]);
  });

  it("findByIds drops missing ids without throwing", async () => {
    const repo = moviesRepository(db);
    const a = await repo.upsertFromTmdb({
      tmdbId: 9100,
      title: "Existing",
      year: 2010,
      genres: ["Drama"],
      directors: ["X"],
      cast: [],
      popularity: 1,
      synopsis: null,
      runtime: 90,
      language: null,
      posterUrl: null,
      backdropUrl: null,
      releaseDate: null,
    });
    const result = await repo.findByIds([
      a.id,
      "00000000-0000-0000-0000-000000000000",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(a.id);
  });

  it("findByIds with empty array returns empty without DB call", async () => {
    const repo = moviesRepository(db);
    const result = await repo.findByIds([]);
    expect(result).toEqual([]);
  });

  it("searchStructured with maxRuntime filters by runtime ceiling", async () => {
    const repo = moviesRepository(db);

    await repo.upsertFromTmdb({
      tmdbId: 302,
      title: "Short Film",
      year: 2020,
      genres: ["Drama"],
      directors: ["Someone"],
      cast: ["Actor"],
      popularity: 30,
      synopsis: null,
      runtime: 90,
      language: null,
      posterUrl: null,
      backdropUrl: null,
      releaseDate: null,
    });
    await repo.upsertFromTmdb({
      tmdbId: 303,
      title: "Long Epic",
      year: 2020,
      genres: ["Drama"],
      directors: ["Someone"],
      cast: ["Actor"],
      popularity: 30,
      synopsis: null,
      runtime: 200,
      language: null,
      posterUrl: null,
      backdropUrl: null,
      releaseDate: null,
    });

    const results = await repo.searchStructured({
      title: "Short Film",
      maxRuntime: 120,
    });
    expect(results.some((m) => m.title === "Short Film")).toBe(true);

    const tooLong = await repo.searchStructured({
      title: "Long Epic",
      maxRuntime: 120,
    });
    expect(tooLong.some((m) => m.title === "Long Epic")).toBe(false);
  });
});
