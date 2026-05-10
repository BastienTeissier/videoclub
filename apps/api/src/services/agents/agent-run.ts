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
import { createReviewPrefillTool } from "../../features/tools/review-prefill.js";
import { createReviewShowTool } from "../../features/tools/review-show.js";
import { createReviewDeleteTool } from "../../features/tools/review-delete.js";
import { createUpdatePreferencesTool } from "../../features/tools/update-preferences.js";
import { createCommitMovieNightTool } from "../../features/tools/commit-movie-night.js";
import {
  streamAgUiEvents,
  stripUiNoise,
  type MemoryRef,
} from "./ag-ui-stream.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { formatMemoryForSystemPrompt } from "./memory.js";

interface ReplayedToolCall {
  aiSdkCallId: string | null;
  toolName: string;
  input: unknown;
  output: unknown;
  runMessageId: string | null;
}

function toolCallAssistantMessage(tc: ReplayedToolCall): ModelMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "tool-call",
        toolCallId: tc.aiSdkCallId ?? `replay-${tc.toolName}`,
        toolName: tc.toolName,
        input: tc.input,
      },
    ],
  };
}

function toolResultMessage(tc: ReplayedToolCall): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: tc.aiSdkCallId ?? `replay-${tc.toolName}`,
        toolName: tc.toolName,
        // Tool outputs are user-defined JSON; coerce via a serialize round-trip
        // so `value` matches the SDK's JSONValue contract without a blind cast.
        // Strip wire-format noise (a2uiMessages, warnings) so the LLM only
        // sees the structured `data` payload from prior runs.
        output: {
          type: "json",
          value: JSON.parse(JSON.stringify(stripUiNoise(tc.output) ?? null)),
        },
      },
    ],
  };
}

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

function buildToolset(
  db: Database,
  userId: string,
  sessionId: string,
  runDbId: string,
): ToolSet {
  return {
    discovery: createDiscoveryTool(db),
    search_tmdb: createSearchTmdbTool(db),
    watchlist_show: createWatchlistShowTool(db, userId),
    watchlist_add: createWatchlistAddTool(db, userId),
    watchlist_remove: createWatchlistRemoveTool(db, userId),
    review_prefill: createReviewPrefillTool(db, userId),
    review_show: createReviewShowTool(db, userId),
    review_delete: createReviewDeleteTool(db, userId),
    update_preferences: createUpdatePreferencesTool(db, sessionId),
    commit_movie_night: createCommitMovieNightTool(db, userId, runDbId),
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

  type FinishStep = {
    toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>;
    toolResults: Array<{ toolCallId: string; output: unknown }>;
  };

  async function recordStepToolCalls(
    step: FinishStep,
    runDbId: string,
  ): Promise<boolean> {
    let endedWithPause = false;
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
      if (!toolResult) {
        // Tool call without result == pending approval (HITL needsApproval)
        endedWithPause = true;
        continue;
      }
      await runs.completeToolCall(toolCallRecord.id, {
        output: toolResult.output,
        durationMs: 0,
      });
      if (isNeedsClarification(toolResult.output)) {
        endedWithPause = true;
      }
    }
    return endedWithPause;
  }

  function buildOnFinish(
    runDbId: string,
    sessionId: string,
  ): (event: { text: string; steps: FinishStep[] }) => Promise<void> {
    return async (event) => {
      try {
        let endedWithPause = false;
        for (const step of event.steps) {
          if (await recordStepToolCalls(step, runDbId)) {
            endedWithPause = true;
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
    const memorySnapshot =
      (await sessions.getViewingPreferences(p.sessionId)) ?? {};
    const memoryRef: MemoryRef = { snapshot: memorySnapshot };
    const memorySection = formatMemoryForSystemPrompt(memorySnapshot);
    const systemPrompt = memorySection
      ? `${SYSTEM_PROMPT}\n\n${memorySection}`
      : SYSTEM_PROMPT;

    const stream = streamText({
      model: getModel(),
      system: systemPrompt,
      messages: p.messages,
      tools: buildToolset(db, p.userId, p.sessionId, p.runDbId),
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
      memory: memoryRef,
    });
  }

  async function* start(input: StartInput): AsyncGenerator<string> {
    // Ownership-scoped lookup: a threadId that doesn't belong to this user
    // is treated as not-found so we silently start a fresh session rather
    // than read or write into someone else's thread. (`findByIdForUser`
    // returns null on mismatch.)
    let session = input.threadId
      ? await sessions.findByIdForUser(input.threadId, input.userId)
      : null;
    if (!session) {
      const seed = await sessions.findLatestViewingPreferencesByUserId(
        input.userId,
      );
      session = await sessions.create(input.userId, seed ?? undefined);
    }

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
    const priorToolCalls = await runs.findCompletedToolCallsBySessionId(
      session.id,
    );

    // Bucket completed tool calls by the user message id that started their run,
    // so we can interleave assistant tool-call + tool tool-result pairs right
    // after the matching user message (preserves AI SDK ordering invariants).
    const toolCallsByMessageId = new Map<string, ReplayedToolCall[]>();
    for (const tc of priorToolCalls) {
      if (!tc.runMessageId) continue;
      const bucket = toolCallsByMessageId.get(tc.runMessageId) ?? [];
      bucket.push(tc);
      toolCallsByMessageId.set(tc.runMessageId, bucket);
    }

    const persisted = previousMessages.slice(0, -1); // drop just-created user msg
    const history: ModelMessage[] = [];
    for (const m of persisted) {
      history.push({
        role: m.role as "user" | "assistant",
        content: m.content ?? "",
      });
      if (m.role === "user") {
        for (const tc of toolCallsByMessageId.get(m.id) ?? []) {
          history.push(toolCallAssistantMessage(tc));
          history.push(toolResultMessage(tc));
        }
      }
    }
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

    // Ownership-scoped lookup: refuse to resume against a session that
    // doesn't belong to this user. Mismatch is indistinguishable from
    // not-found by design — don't leak whether the threadId exists.
    const session = await sessions.findByIdForUser(
      input.threadId,
      input.userId,
    );
    if (!session) {
      throw new Error(`Session not found: ${input.threadId}`);
    }

    // Defense-in-depth: also verify the pending tool call belongs to this
    // session (prevents resuming a tool call from another session by
    // pairing its interruptId with this user's threadId).
    const pendingRun = await runs.findRunById(pending.runId);
    if (!pendingRun || pendingRun.sessionId !== session.id) {
      throw new Error(`Interrupt does not belong to this session`);
    }

    const tools = buildToolset(db, input.userId, session.id, pending.runId);
    const toolName = pending.toolName as keyof typeof tools;
    const tool = tools[toolName];
    if (!tool || typeof tool.execute !== "function") {
      throw new Error(`Unknown or non-executable tool: ${pending.toolName}`);
    }

    const respObj = (input.response ?? {}) as { approved?: boolean };
    const isReject =
      pending.toolName === "commit_movie_night" && respObj.approved === false;

    const mergedInput = mergeResumeInput(
      pending.toolName,
      pending.input,
      input.response,
    );

    const resumedToolCallId = `resume-${input.interruptId}`;
    let result: unknown;
    if (isReject) {
      result = {
        kind: "rejected" as const,
        message: "User rejected the proposed plan.",
      };
    } else {
      // Dynamic dispatch over a heterogeneous ToolSet: the tool's input type
      // varies per name and cannot be statically reconciled with mergedInput.
      // The original input was already validated by the AI SDK; mergeResumeInput
      // only adds resolution-side fields (pickedMovieId, editedReason).
      const execute = tool.execute as (
        input: unknown,
        opts: { toolCallId: string; messages: ModelMessage[] },
      ) => Promise<unknown>;
      result = await execute(mergedInput, {
        toolCallId: resumedToolCallId,
        messages: [],
      });
    }

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
          // Tool outputs are user-defined JSON; coerce via a serialize round-trip
          // so `value` matches the SDK's JSONValue contract without a blind cast.
          output: { type: "json", value: JSON.parse(JSON.stringify(result ?? null)) },
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
