import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Database } from "../client/index.js";
import { reviewsRepository } from "./reviews.js";
import { moviesRepository } from "./movies.js";
import { reviews } from "../schema/reviews.js";
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
    tmdbId: 2001,
    title: "Inception",
    year: 2010,
    synopsis: "A thief who steals through dreams.",
    genres: ["Sci-Fi"],
    cast: ["Leonardo DiCaprio"],
    directors: ["Christopher Nolan"],
    runtime: 148,
    language: "en",
    posterUrl: "/inception.jpg",
    backdropUrl: null,
    popularity: 50,
    releaseDate: "2010-07-16",
  },
  {
    tmdbId: 2002,
    title: "Interstellar",
    year: 2014,
    synopsis: "Space exploration through wormholes.",
    genres: ["Sci-Fi"],
    cast: ["Matthew McConaughey"],
    directors: ["Christopher Nolan"],
    runtime: 169,
    language: "en",
    posterUrl: "/interstellar.jpg",
    backdropUrl: null,
    popularity: 70,
    releaseDate: "2014-11-07",
  },
  {
    tmdbId: 2003,
    title: "Tenet",
    year: 2020,
    synopsis: "Time inversion thriller.",
    genres: ["Sci-Fi"],
    cast: ["John David Washington"],
    directors: ["Christopher Nolan"],
    runtime: 150,
    language: "en",
    posterUrl: "/tenet.jpg",
    backdropUrl: null,
    popularity: 40,
    releaseDate: "2020-08-26",
  },
];

const userId = "test-user-reviews";
const otherUserId = "test-user-other";

describe("reviewsRepository", () => {
  let movieIds: string[];

  beforeAll(async () => {
    const moviesRepo = moviesRepository(db);
    const inserted = await Promise.all(
      sampleMovies.map((m) => moviesRepo.upsertFromTmdb(m))
    );
    movieIds = inserted.map((m) => m.id);
  });

  it("upsert — first call inserts row with numeric rating", async () => {
    const repo = reviewsRepository(db);
    const review = await repo.upsert(userId, movieIds[0]!, {
      rating: 4.5,
      text: "Great",
    });
    expect(review.userId).toBe(userId);
    expect(review.movieId).toBe(movieIds[0]);
    expect(review.rating).toBe(4.5);
    expect(typeof review.rating).toBe("number");
    expect(review.text).toBe("Great");
  });

  it("upsert — second call updates same row, advances updatedAt", async () => {
    const repo = reviewsRepository(db);
    const first = await repo.findByUserAndMovie(userId, movieIds[0]!);
    expect(first).not.toBeNull();
    const firstUpdatedAt = first!.updatedAt;

    await new Promise((r) => setTimeout(r, 10));

    const updated = await repo.upsert(userId, movieIds[0]!, {
      rating: 3,
      text: null,
    });
    expect(updated.rating).toBe(3);
    expect(updated.text).toBeNull();
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      firstUpdatedAt.getTime()
    );

    const all = await repo.listByUser(userId);
    expect(all.filter((r) => r.movieId === movieIds[0]!)).toHaveLength(1);
  });

  it("delete — match returns 1 and removes row", async () => {
    const repo = reviewsRepository(db);
    await repo.upsert(userId, movieIds[1]!, { rating: 4 });
    const count = await repo.delete(userId, movieIds[1]!);
    expect(count).toBe(1);
    const after = await repo.findByUserAndMovie(userId, movieIds[1]!);
    expect(after).toBeNull();
  });

  it("delete — no match returns 0", async () => {
    const repo = reviewsRepository(db);
    const count = await repo.delete(userId, movieIds[2]!);
    expect(count).toBe(0);
  });

  it("findByUserAndMovie — isolates by user", async () => {
    const repo = reviewsRepository(db);
    const found = await repo.findByUserAndMovie(userId, movieIds[0]!);
    expect(found).not.toBeNull();
    expect(found!.rating).toBe(3);

    const otherFound = await repo.findByUserAndMovie(
      otherUserId,
      movieIds[0]!
    );
    expect(otherFound).toBeNull();
  });

  it("getReviewedMovieRatings — returns subset map", async () => {
    const repo = reviewsRepository(db);
    await repo.upsert(userId, movieIds[2]!, { rating: 5 });
    const map = await repo.getReviewedMovieRatings(userId, [
      movieIds[0]!,
      movieIds[2]!,
    ]);
    expect(map.size).toBe(2);
    expect(map.get(movieIds[0]!)).toBe(3);
    expect(map.get(movieIds[2]!)).toBe(5);
  });

  it("getReviewedMovieRatings — empty input returns empty Map", async () => {
    const repo = reviewsRepository(db);
    const map = await repo.getReviewedMovieRatings(userId, []);
    expect(map.size).toBe(0);
  });

  it("getReviewedMovieRatings — foreign movieIds not present", async () => {
    const repo = reviewsRepository(db);
    const map = await repo.getReviewedMovieRatings(otherUserId, [
      movieIds[0]!,
    ]);
    expect(map.size).toBe(0);
  });

  it("unique index — direct duplicate insert raises DB error", async () => {
    await expect(
      db.insert(reviews).values({
        userId,
        movieId: movieIds[0]!,
        rating: "2.5",
        text: null,
      })
    ).rejects.toThrow();
  });

  it("listWithMoviesByUser — joins movie + isolates by user", async () => {
    const repo = reviewsRepository(db);
    await repo.upsert(otherUserId, movieIds[0]!, { rating: 1.5 });

    const rows = await repo.listWithMoviesByUser(userId);
    expect(rows.every((r) => r.userId === userId)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.movie.id).toBe(row.movieId);
      expect(typeof row.movie.title).toBe("string");
    }
  });

  it("listWithMoviesByUser — orders by updatedAt DESC (upsert bumps to top)", async () => {
    const repo = reviewsRepository(db);
    await new Promise((r) => setTimeout(r, 10));
    await repo.upsert(userId, movieIds[2]!, { rating: 4 });

    const rows = await repo.listWithMoviesByUser(userId);
    expect(rows[0]!.movieId).toBe(movieIds[2]!);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.updatedAt.getTime()).toBeGreaterThanOrEqual(
        rows[i]!.updatedAt.getTime()
      );
    }
  });

  it("listWithMoviesByUser — empty when user has no reviews", async () => {
    const repo = reviewsRepository(db);
    const rows = await repo.listWithMoviesByUser("user-with-nothing");
    expect(rows).toEqual([]);
  });
});
