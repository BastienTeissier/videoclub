import { eq, and, isNull, desc } from "drizzle-orm";
import { agentRuns } from "../schema/agent-runs.js";
import { toolCalls } from "../schema/tool-calls.js";
import type { Database } from "../client/index.js";

export function agentRunsRepository(db: Database) {
  return {
    async createRun(data: { sessionId: string; messageId?: string | null }) {
      const [run] = await db
        .insert(agentRuns)
        .values({
          sessionId: data.sessionId,
          messageId: data.messageId ?? null,
          status: "running",
        })
        .returning();
      return run!;
    },

    async completeRun(id: string) {
      const [run] = await db
        .update(agentRuns)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(agentRuns.id, id))
        .returning();
      return run!;
    },

    async failRun(id: string, error: string) {
      const [run] = await db
        .update(agentRuns)
        .set({ status: "failed", error, completedAt: new Date() })
        .where(eq(agentRuns.id, id))
        .returning();
      return run!;
    },

    async createToolCall(data: {
      runId: string;
      toolName: string;
      input: unknown;
    }) {
      const [tc] = await db
        .insert(toolCalls)
        .values({
          runId: data.runId,
          toolName: data.toolName,
          input: data.input,
        })
        .returning();
      return tc!;
    },

    async completeToolCall(
      id: string,
      data: { output: unknown; durationMs: number }
    ) {
      const [tc] = await db
        .update(toolCalls)
        .set({ output: data.output, durationMs: data.durationMs })
        .where(eq(toolCalls.id, id))
        .returning();
      return tc!;
    },

    async findPendingToolCall(sessionId: string, toolName: string) {
      const rows = await db
        .select({
          id: toolCalls.id,
          toolName: toolCalls.toolName,
          input: toolCalls.input,
          runId: toolCalls.runId,
        })
        .from(toolCalls)
        .innerJoin(agentRuns, eq(toolCalls.runId, agentRuns.id))
        .where(
          and(
            eq(agentRuns.sessionId, sessionId),
            eq(toolCalls.toolName, toolName),
            isNull(toolCalls.output),
          ),
        )
        .orderBy(desc(toolCalls.createdAt))
        .limit(1);
      return rows[0] ?? null;
    },
  };
}
