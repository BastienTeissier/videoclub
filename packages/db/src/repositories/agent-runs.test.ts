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

  it("findToolCallByAiSdkCallId returns the row by AI SDK call id, including pending output", async () => {
    const sessions = agentSessionsRepository(db);
    const runs = agentRunsRepository(db);

    const session = await sessions.create("user-find-tc");
    const run = await runs.createRun({ sessionId: session.id });
    const tc = await runs.createToolCall({
      runId: run.id,
      toolName: "review_delete",
      input: { title: "Inception" },
      aiSdkCallId: "call_abc123",
    });

    const found = await runs.findToolCallByAiSdkCallId("call_abc123");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(tc.id);
    expect(found!.aiSdkCallId).toBe("call_abc123");
    expect(found!.toolName).toBe("review_delete");
    expect(found!.input).toEqual({ title: "Inception" });
    expect(found!.output).toBeNull();
    expect(found!.runId).toBe(run.id);
  });

  it("findToolCallByAiSdkCallId returns null for unknown id", async () => {
    const runs = agentRunsRepository(db);
    const found = await runs.findToolCallByAiSdkCallId("call_does_not_exist");
    expect(found).toBeNull();
  });
});
