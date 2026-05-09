import {
  streamText,
  stepCountIs,
  type ModelMessage,
  type ToolSet,
} from "ai";
import {
  agentSessionsRepository,
  chatMessagesRepository,
  agentRunsRepository,
  type Database,
} from "@repo/db";
import { getModel } from "../../lib/ai-provider.js";
import { createDiscoveryTool } from "../../features/tools/discovery.js";
import { createSearchTmdbTool } from "../../features/tools/search-tmdb.js";
import { createWatchlistShowTool } from "../../features/tools/watchlist-show.js";
import { createWatchlistAddTool } from "../../features/tools/watchlist-add.js";
import { createWatchlistRemoveTool } from "../../features/tools/watchlist-remove.js";
import { createReviewAddTool } from "../../features/tools/review-add.js";
import { createReviewShowTool } from "../../features/tools/review-show.js";
import { createReviewDeleteTool } from "../../features/tools/review-delete.js";
import { streamAgUiEvents } from "./ag-ui-stream.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";

interface StartInput {
  userId: string;
  threadId?: string;
  runId: string;
  messages: ModelMessage[];
}

interface ResumeInput {
  userId: string;
  threadId: string;
  runId: string;
  interruptId: string;
  response: unknown;
}

function buildToolset(db: Database, userId: string): ToolSet {
  return {
    discovery: createDiscoveryTool(db),
    search_tmdb: createSearchTmdbTool(db),
    watchlist_show: createWatchlistShowTool(db, userId),
    watchlist_add: createWatchlistAddTool(db, userId),
    watchlist_remove: createWatchlistRemoveTool(db, userId),
    review_add: createReviewAddTool(db, userId),
    review_show: createReviewShowTool(db, userId),
    review_delete: createReviewDeleteTool(db, userId),
  };
}

function isNeedsClarification(output: unknown): boolean {
  return (
    typeof output === "object" &&
    output !== null &&
    (output as { kind?: unknown }).kind === "needs-clarification"
  );
}

function mergeResumeInput(
  toolName: string,
  originalInput: unknown,
  response: unknown,
): unknown {
  const orig = (originalInput ?? {}) as Record<string, unknown>;
  const resp = (response ?? {}) as Record<string, unknown>;

  // Clarification: response carries pickedMovieId.
  // Approval (commit_movie_night, search_tmdb): response carries approved/editedReason
  // and the original input is preserved.
  if ("pickedMovieId" in resp) {
    return { ...orig, movieId: resp.pickedMovieId };
  }
  if (toolName === "commit_movie_night") {
    return {
      ...orig,
      ...(typeof resp.editedReason === "string" ? { reason: resp.editedReason } : {}),
    };
  }
  return orig;
}

export function agentRun(db: Database) {
  const sessions = agentSessionsRepository(db);
  const chatMessages = chatMessagesRepository(db);
  const runs = agentRunsRepository(db);

  function buildOnFinish(
    runDbId: string,
    sessionId: string,
  ): (event: {
    text: string;
    steps: Array<{
      toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>;
      toolResults: Array<{ toolCallId: string; output: unknown }>;
    }>;
  }) => Promise<void> {
    return async (event) => {
      try {
        let endedWithPause = false;

        for (const step of event.steps) {
          for (const tc of step.toolCalls) {
            const toolCallRecord = await runs.createToolCall({
              runId: runDbId,
              toolName: tc.toolName,
              input: tc.input,
              aiSdkCallId: tc.toolCallId,
            });
            const toolResult = step.toolResults.find(
              (tr) => tr.toolCallId === tc.toolCallId,
            );
            if (toolResult) {
              await runs.completeToolCall(toolCallRecord.id, {
                output: toolResult.output,
                durationMs: 0,
              });
              if (isNeedsClarification(toolResult.output)) {
                endedWithPause = true;
              }
            } else {
              // Tool call without result == pending approval (HITL needsApproval)
              endedWithPause = true;
            }
          }
        }

        if (event.text) {
          await chatMessages.create({
            sessionId,
            role: "assistant",
            content: event.text,
          });
        }

        if (!endedWithPause) {
          await runs.completeRun(runDbId);
        }
      } catch (error) {
        await runs.failRun(
          runDbId,
          error instanceof Error ? error.message : String(error),
        );
      }
    };
  }

  async function* drive(p: {
    runDbId: string;
    sessionId: string;
    userId: string;
    runId: string;
    messages: ModelMessage[];
  }): AsyncGenerator<string> {
    const stream = streamText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: p.messages,
      tools: buildToolset(db, p.userId),
      stopWhen: stepCountIs(5),
      onFinish: buildOnFinish(p.runDbId, p.sessionId),
      onError: async ({ error }) => {
        await runs.failRun(
          p.runDbId,
          error instanceof Error ? error.message : String(error),
        );
      },
    });

    yield* streamAgUiEvents(stream.fullStream, {
      threadId: p.sessionId,
      runId: p.runId,
    });
  }

  async function* start(input: StartInput): AsyncGenerator<string> {
    let session = input.threadId ? await sessions.findById(input.threadId) : null;
    if (!session) session = await sessions.create(input.userId);

    const lastUserMessage = [...input.messages]
      .reverse()
      .find((m) => m.role === "user");
    let userMessageId: string | null = null;
    if (lastUserMessage && typeof lastUserMessage.content === "string") {
      const created = await chatMessages.create({
        sessionId: session.id,
        role: "user",
        content: lastUserMessage.content,
      });
      userMessageId = created.id;
    }

    const previousMessages = await chatMessages.findBySessionId(session.id);
    const history: ModelMessage[] = previousMessages.slice(0, -1).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content ?? "",
    }));
    const messages = [...history, ...input.messages];

    const run = await runs.createRun({
      sessionId: session.id,
      messageId: userMessageId,
    });

    yield* drive({
      runDbId: run.id,
      sessionId: session.id,
      userId: input.userId,
      runId: input.runId,
      messages,
    });
  }

  async function* resume(input: ResumeInput): AsyncGenerator<string> {
    const pending = await runs.findToolCallByAiSdkCallId(input.interruptId);
    if (!pending) {
      throw new Error(`No tool call found for interrupt ${input.interruptId}`);
    }

    const session = await sessions.findById(input.threadId);
    if (!session) {
      throw new Error(`Session not found: ${input.threadId}`);
    }

    const tools = buildToolset(db, input.userId);
    const toolName = pending.toolName as keyof typeof tools;
    const tool = tools[toolName];
    if (!tool || typeof tool.execute !== "function") {
      throw new Error(`Unknown or non-executable tool: ${pending.toolName}`);
    }

    const mergedInput = mergeResumeInput(
      pending.toolName,
      pending.input,
      input.response,
    );

    const resumedToolCallId = `resume-${input.interruptId}`;
    const result = await tool.execute(mergedInput as never, {
      toolCallId: resumedToolCallId,
      messages: [],
    });

    // Record the resume tool call against the same agent_runs row.
    const resumedRecord = await runs.createToolCall({
      runId: pending.runId,
      toolName: pending.toolName,
      input: mergedInput,
      aiSdkCallId: resumedToolCallId,
    });
    await runs.completeToolCall(resumedRecord.id, {
      output: result,
      durationMs: 0,
    });

    // Re-enter streamText so the LLM can continue post-resolution.
    const previousMessages = await chatMessages.findBySessionId(session.id);
    const history: ModelMessage[] = previousMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content ?? "",
    }));
    const toolMessage: ModelMessage = {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: resumedToolCallId,
          toolName: pending.toolName,
          output: { type: "json", value: result as never },
        },
      ],
    };

    yield* drive({
      runDbId: pending.runId,
      sessionId: session.id,
      userId: input.userId,
      runId: input.runId,
      messages: [...history, toolMessage],
    });
  }

  return { start, resume };
}
