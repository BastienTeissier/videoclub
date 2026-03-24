import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Database } from "../client/index.js";
import { agentSessionsRepository } from "./agent-sessions.js";
import { chatMessagesRepository } from "./chat-messages.js";
import { agentRunsRepository } from "./agent-runs.js";
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

describe("agentRunsRepository", () => {
  it("full run lifecycle: create → tool call → complete", async () => {
    const sessions = agentSessionsRepository(db);
    const messages = chatMessagesRepository(db);
    const runs = agentRunsRepository(db);

    const session = await sessions.create("user-1");
    const message = await messages.create({
      sessionId: session.id,
      role: "user",
      content: "find movies",
    });

    const run = await runs.createRun({
      sessionId: session.id,
      messageId: message.id,
    });
    expect(run.status).toBe("running");

    const tc = await runs.createToolCall({
      runId: run.id,
      toolName: "search_movies",
      input: { director: "Spielberg" },
    });
    expect(tc.toolName).toBe("search_movies");

    const completedTc = await runs.completeToolCall(tc.id, {
      output: [{ title: "Jaws" }],
      durationMs: 42,
    });
    expect(completedTc.output).toEqual([{ title: "Jaws" }]);
    expect(completedTc.durationMs).toBe(42);

    const completedRun = await runs.completeRun(run.id);
    expect(completedRun.status).toBe("completed");
    expect(completedRun.completedAt).not.toBeNull();
  });
});
