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

  it("updates session context", async () => {
    const repo = agentSessionsRepository(db);

    const session = await repo.create("user-2");
    const updated = await repo.updateContext(session.id, { mood: "happy" });
    expect(updated!.context).toEqual({ mood: "happy" });
  });
});
