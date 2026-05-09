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

  it("findCompletedToolCallsBySessionId returns completed-only rows in chronological order", async () => {
    const sessions = agentSessionsRepository(db);
    const messages = chatMessagesRepository(db);
    const runs = agentRunsRepository(db);

    const session = await sessions.create("user-replay");

    // Run 1: started by user message m1, has 2 completed tool calls
    const m1 = await messages.create({
      sessionId: session.id,
      role: "user",
      content: "find comedies",
    });
    const r1 = await runs.createRun({ sessionId: session.id, messageId: m1.id });
    const tc1a = await runs.createToolCall({
      runId: r1.id,
      toolName: "discovery",
      input: { view: "grid" },
      aiSdkCallId: "call_1a",
    });
    await runs.completeToolCall(tc1a.id, {
      output: { data: { movies: [] } },
      durationMs: 10,
    });
    const tc1b = await runs.createToolCall({
      runId: r1.id,
      toolName: "search_tmdb",
      input: { query: "x" },
      aiSdkCallId: "call_1b",
    });
    await runs.completeToolCall(tc1b.id, {
      output: { results: [] },
      durationMs: 12,
    });

    // Run 2: started by m2, one completed and one PENDING tool call (no output)
    const m2 = await messages.create({
      sessionId: session.id,
      role: "user",
      content: "compare them",
    });
    const r2 = await runs.createRun({ sessionId: session.id, messageId: m2.id });
    const tc2a = await runs.createToolCall({
      runId: r2.id,
      toolName: "discovery",
      input: { view: "comparison" },
      aiSdkCallId: "call_2a",
    });
    await runs.completeToolCall(tc2a.id, {
      output: { data: { view: "comparison" } },
      durationMs: 8,
    });
    await runs.createToolCall({
      runId: r2.id,
      toolName: "commit_movie_night",
      input: { pickedMovieId: "x" },
      aiSdkCallId: "call_2b_pending",
    });

    const result = await runs.findCompletedToolCallsBySessionId(session.id);
    const ids = result.map((r) => r.aiSdkCallId);
    expect(ids).toEqual(["call_1a", "call_1b", "call_2a"]);

    // Pending one absent
    expect(result.some((r) => r.aiSdkCallId === "call_2b_pending")).toBe(false);

    // runMessageId carried through from agent_runs
    expect(result[0]!.runMessageId).toBe(m1.id);
    expect(result[1]!.runMessageId).toBe(m1.id);
    expect(result[2]!.runMessageId).toBe(m2.id);
  });

  it("findCompletedToolCallsBySessionId scopes to the given session", async () => {
    const sessions = agentSessionsRepository(db);
    const runs = agentRunsRepository(db);

    const sessionA = await sessions.create("user-scope-a");
    const sessionB = await sessions.create("user-scope-b");
    const runA = await runs.createRun({ sessionId: sessionA.id });
    const runB = await runs.createRun({ sessionId: sessionB.id });

    const tcA = await runs.createToolCall({
      runId: runA.id,
      toolName: "discovery",
      input: {},
      aiSdkCallId: "scope_a",
    });
    await runs.completeToolCall(tcA.id, { output: { ok: true }, durationMs: 1 });
    const tcB = await runs.createToolCall({
      runId: runB.id,
      toolName: "discovery",
      input: {},
      aiSdkCallId: "scope_b",
    });
    await runs.completeToolCall(tcB.id, { output: { ok: true }, durationMs: 1 });

    const onlyA = await runs.findCompletedToolCallsBySessionId(sessionA.id);
    expect(onlyA.map((r) => r.aiSdkCallId)).toEqual(["scope_a"]);
  });
});
