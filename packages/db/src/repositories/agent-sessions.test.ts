import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Database } from "../client/index.js";
import { agentSessionsRepository } from "./agent-sessions.js";
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

describe("agentSessionsRepository", () => {
  it("creates and retrieves session", async () => {
    const repo = agentSessionsRepository(db);

    const session = await repo.create("user-1");
    expect(session.userId).toBe("user-1");
    expect(session.id).toBeDefined();

    const found = await repo.findById(session.id);
    expect(found).not.toBeNull();
    expect(found!.userId).toBe("user-1");
  });

  it("findByIdForUser returns the session when ownership matches", async () => {
    const repo = agentSessionsRepository(db);
    const session = await repo.create("user-owner");
    const found = await repo.findByIdForUser(session.id, "user-owner");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(session.id);
  });

  it("findByIdForUser returns null when ownership does not match", async () => {
    const repo = agentSessionsRepository(db);
    const session = await repo.create("user-A");
    const found = await repo.findByIdForUser(session.id, "user-B");
    expect(found).toBeNull();
  });

  it("updates session context", async () => {
    const repo = agentSessionsRepository(db);

    const session = await repo.create("user-2");
    const updated = await repo.updateContext(session.id, { mood: "happy" });
    expect(updated!.context).toEqual({ mood: "happy" });
  });

  it("creates session with seeded viewing preferences", async () => {
    const repo = agentSessionsRepository(db);

    const session = await repo.create("user-prefs", {
      genres: ["Comedy"],
      maxRuntime: 90,
    });
    expect(session.viewingPreferences).toEqual({
      genres: ["Comedy"],
      maxRuntime: 90,
    });
  });

  it("findLatestViewingPreferencesByUserId returns the latest session's prefs", async () => {
    const repo = agentSessionsRepository(db);

    await repo.create("user-latest", { genres: ["Drama"] });
    // small wait isn't needed — defaultNow() differs by microseconds
    const second = await repo.create("user-latest", { genres: ["Sci-Fi"] });

    const latest = await repo.findLatestViewingPreferencesByUserId("user-latest");
    expect(latest).toEqual({ genres: ["Sci-Fi"] });
    expect(second.viewingPreferences).toEqual({ genres: ["Sci-Fi"] });
  });

  it("getViewingPreferences and setViewingPreferences round-trip", async () => {
    const repo = agentSessionsRepository(db);
    const session = await repo.create("user-set");

    expect(await repo.getViewingPreferences(session.id)).toEqual({});
    await repo.setViewingPreferences(session.id, { moods: ["feel-good"] });
    expect(await repo.getViewingPreferences(session.id)).toEqual({
      moods: ["feel-good"],
    });
  });

  it("applyPreferencesPatch merges with notes FIFO-cap and returns json patch ops", async () => {
    const repo = agentSessionsRepository(db);
    const session = await repo.create("user-patch", {
      notes: ["a", "b", "c", "d", "e", "f", "g"],
    });

    const result = await repo.applyPreferencesPatch(session.id, {
      notes: ["h", "i"],
      maxRuntime: 100,
    });
    expect(result).not.toBeNull();
    expect(result!.next.notes).toEqual([
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
    ]);
    expect(result!.next.maxRuntime).toBe(100);
    expect(result!.jsonPatchOps.some((op) => op.op === "remove")).toBe(true);
  });

  it("applyPreferencesPatch returns null for unknown session", async () => {
    const repo = agentSessionsRepository(db);
    const result = await repo.applyPreferencesPatch(
      "00000000-0000-4000-8000-000000000000",
      { genres: ["X"] },
    );
    expect(result).toBeNull();
  });
});
