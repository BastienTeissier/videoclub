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
});
