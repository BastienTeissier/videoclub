import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Database } from "../client/index.js";
import { watchlistRepository } from "./watchlist.js";
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

const sampleMovies: NewMovie[] = [
  {
    tmdbId: 1001,
    title: "Arrival",
    year: 2016,
    synopsis: "A linguist recruited by the military.",
    genres: ["Drama", "Science Fiction"],
    cast: ["Amy Adams"],
    directors: ["Denis Villeneuve"],
    runtime: 116,
    language: "en",
    posterUrl: "/arrival.jpg",
    backdropUrl: null,
    popularity: 42.5,
    releaseDate: "2016-11-11",
  },
  {
    tmdbId: 1002,
    title: "Dune",
    year: 2021,
    synopsis: "A noble family on a desert planet.",
    genres: ["Science Fiction"],
    cast: ["Timothée Chalamet"],
    directors: ["Denis Villeneuve"],
    runtime: 155,
    language: "en",
    posterUrl: "/dune.jpg",
    backdropUrl: null,
    popularity: 80,
    releaseDate: "2021-10-22",
  },
  {
    tmdbId: 1003,
    title: "Heat",
    year: 1995,
    synopsis: "A detective and a criminal.",
    genres: ["Crime", "Drama"],
    cast: ["Al Pacino", "Robert De Niro"],
    directors: ["Michael Mann"],
    runtime: 170,
    language: "en",
    posterUrl: "/heat.jpg",
    backdropUrl: null,
    popularity: 60,
    releaseDate: "1995-12-15",
  },
];

const userId = "test-user-001";

describe("watchlistRepository", () => {
  let movieIds: string[];

  beforeAll(async () => {
    const moviesRepo = moviesRepository(db);
    const inserted = await Promise.all(
      sampleMovies.map((m) => moviesRepo.upsertFromTmdb(m))
    );
    movieIds = inserted.map((m) => m.id);
  });

  it("add — inserts row and returns item with addedAt", async () => {
    const repo = watchlistRepository(db);
    const item = await repo.add(userId, movieIds[0]!);

    expect(item).not.toBeNull();
    expect(item!.userId).toBe(userId);
    expect(item!.movieId).toBe(movieIds[0]);
    expect(item!.addedAt).toBeInstanceOf(Date);
  });

  it("add — duplicate (userId, movieId) returns null", async () => {
    const repo = watchlistRepository(db);
    const duplicate = await repo.add(userId, movieIds[0]!);
    expect(duplicate).toBeNull();
  });

  it("remove — deletes matching row, returns 1", async () => {
    const repo = watchlistRepository(db);
    // add then remove
    await repo.add(userId, movieIds[1]!);
    const count = await repo.remove(userId, movieIds[1]!);
    expect(count).toBe(1);
  });

  it("remove — no match returns 0", async () => {
    const repo = watchlistRepository(db);
    const count = await repo.remove(userId, movieIds[2]!);
    expect(count).toBe(0);
  });

  it("listByUser — returns movies joined, ordered by addedAt DESC", async () => {
    const repo = watchlistRepository(db);
    // add movies[1] and movies[2] (movies[0] already added)
    await repo.add(userId, movieIds[1]!);
    // small delay to ensure different addedAt
    await new Promise((r) => setTimeout(r, 10));
    await repo.add(userId, movieIds[2]!);

    const list = await repo.listByUser(userId);
    expect(list).toHaveLength(3);
    // most recent first
    expect(list[0]!.title).toBe("Heat");
    expect(list[1]!.title).toBe("Dune");
    expect(list[2]!.title).toBe("Arrival");
    // has full movie fields
    expect(list[0]!.tmdbId).toBe(1003);
  });

  it("listByUser — empty watchlist returns []", async () => {
    const repo = watchlistRepository(db);
    const list = await repo.listByUser("nonexistent-user");
    expect(list).toHaveLength(0);
  });

  it("isInWatchlist — returns true when present", async () => {
    const repo = watchlistRepository(db);
    const result = await repo.isInWatchlist(userId, movieIds[0]!);
    expect(result).toBe(true);
  });

  it("isInWatchlist — returns false when absent", async () => {
    const repo = watchlistRepository(db);
    const result = await repo.isInWatchlist("other-user", movieIds[0]!);
    expect(result).toBe(false);
  });

  it("searchByTitleInWatchlist — returns matching movie by partial title", async () => {
    const repo = watchlistRepository(db);
    // user has Arrival, Dune, Heat in watchlist
    const results = await repo.searchByTitleInWatchlist(userId, "arr");
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Arrival");
  });

  it("searchByTitleInWatchlist — case-insensitive match", async () => {
    const repo = watchlistRepository(db);
    const results = await repo.searchByTitleInWatchlist(userId, "arrival");
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Arrival");
  });

  it("searchByTitleInWatchlist — returns empty array when no match", async () => {
    const repo = watchlistRepository(db);
    const results = await repo.searchByTitleInWatchlist(userId, "Nonexistent");
    expect(results).toHaveLength(0);
  });

  it("searchByTitleInWatchlist — only searches within user's watchlist", async () => {
    const repo = watchlistRepository(db);
    // movie exists in DB but not in other-user's watchlist
    const results = await repo.searchByTitleInWatchlist("other-user", "Arrival");
    expect(results).toHaveLength(0);
  });

  it("getWatchlistedMovieIds — returns correct subset", async () => {
    const repo = watchlistRepository(db);
    // user has movies[0], movies[1], movies[2]
    // query for movies[0] and movies[2] only
    const ids = await repo.getWatchlistedMovieIds(userId, [
      movieIds[0]!,
      movieIds[2]!,
    ]);
    expect(ids).toBeInstanceOf(Set);
    expect(ids.size).toBe(2);
    expect(ids.has(movieIds[0]!)).toBe(true);
    expect(ids.has(movieIds[2]!)).toBe(true);
  });
});
