import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Database } from "../client/index.js";
import { agentSessionsRepository } from "./agent-sessions.js";
import { agentRunsRepository } from "./agent-runs.js";
import { moviesRepository } from "./movies.js";
import { movieNightPlansRepository } from "./movie-night-plans.js";
import type postgres from "postgres";

let container: StartedPostgreSqlContainer;
let db: Database;
let client: postgres.Sql;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const result = createDb(container.getConnectionUri());
  db = result.db;
  client = result.client;
  await migrate(db, { migrationsFolder: "./drizzle" });
}, 60000);

afterAll(async () => {
  await client.end();
  await container.stop();
});

describe("movieNightPlansRepository", () => {
  it("creates a plan and lists by user", async () => {
    const sessions = agentSessionsRepository(db);
    const runs = agentRunsRepository(db);
    const movies = moviesRepository(db);
    const plans = movieNightPlansRepository(db);

    const session = await sessions.create("user-mn");
    const run = await runs.createRun({ sessionId: session.id });
    const picked = await movies.upsertFromTmdb({
      tmdbId: 1001,
      title: "Picked",
      year: 2020,
    });
    const backup = await movies.upsertFromTmdb({
      tmdbId: 1002,
      title: "Backup",
      year: 2021,
    });

    const created = await plans.create({
      userId: "user-mn",
      runId: run.id,
      pickedMovieId: picked.id,
      backupMovieIds: [backup.id],
      reason: "Friday vibe",
    });

    expect(created.userId).toBe("user-mn");
    expect(created.pickedMovieId).toBe(picked.id);
    expect(created.backupMovieIds).toEqual([backup.id]);
    expect(created.reason).toBe("Friday vibe");

    const listed = await plans.findByUser("user-mn");
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe(created.id);
  });

  it("supports null reason and empty backups", async () => {
    const sessions = agentSessionsRepository(db);
    const runs = agentRunsRepository(db);
    const movies = moviesRepository(db);
    const plans = movieNightPlansRepository(db);

    const session = await sessions.create("user-mn-null");
    const run = await runs.createRun({ sessionId: session.id });
    const picked = await movies.upsertFromTmdb({
      tmdbId: 1003,
      title: "Solo",
      year: 2022,
    });

    const created = await plans.create({
      userId: "user-mn-null",
      runId: run.id,
      pickedMovieId: picked.id,
      backupMovieIds: [],
      reason: null,
    });

    expect(created.backupMovieIds).toEqual([]);
    expect(created.reason).toBeNull();
  });
});
