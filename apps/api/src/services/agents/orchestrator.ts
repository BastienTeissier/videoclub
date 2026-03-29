import {
  streamText,
  stepCountIs,
  type ModelMessage,
  type TextStreamPart,
  type ToolSet,
} from "ai";
import { getModel } from "../../lib/ai-provider.js";
import { createSearchMoviesTool } from "../../features/tools/search-movies.js";
import { createSearchTmdbTool } from "../../features/tools/search-tmdb.js";
import {
  agentSessionsRepository,
  chatMessagesRepository,
  agentRunsRepository,
} from "@repo/db";
import type { Database } from "@repo/db";

const SYSTEM_PROMPT = `You are a movie expert assistant. Your job is to help users find movies from the local database.

When a user asks about movies, extract structured search parameters from their natural language query and use the search_movies tool.

- Extract director, actor, genre, title, or year when mentioned
- If the user mentions a person, determine whether they are likely a director or actor
- Use the tool to search, then present the results in a friendly way
- If no results are found, suggest broadening the search

Always use the search_movies tool to find movies — do not make up movie information.

If local search results are insufficient (0 results, results don't match user intent, or user explicitly asks for more), call the search_tmdb tool to search TMDB for additional results. Do NOT call search_tmdb when local results already satisfy the query.`;

interface OrchestratorParams {
  db: Database;
  sessionId?: string;
  userId: string;
  messages: ModelMessage[];
}

interface OrchestratorResult {
  sessionId: string;
  runId: string;
  stream: { fullStream: AsyncIterable<TextStreamPart<ToolSet>> };
}

interface ApprovedToolParams {
  db: Database;
  sessionId: string;
  userId: string;
  toolName: string;
}

export async function runApprovedTool({
  db,
  sessionId,
  userId,
  toolName,
}: ApprovedToolParams): Promise<{
  sessionId: string;
  runId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  result: unknown;
}> {
  const sessions = agentSessionsRepository(db);
  const runs = agentRunsRepository(db);

  // The AG-UI client threadId may not match the DB session ID,
  // so fall back to the user's latest session
  let session = await sessions.findById(sessionId);
  if (!session) {
    session = await sessions.findLatestByUserId(userId);
  }
  if (!session) {
    throw new Error(`No session found for user`);
  }

  // Find the pending tool call that was awaiting approval
  const pending = await runs.findPendingToolCall(session.id, toolName);
  if (!pending) {
    throw new Error(`No pending ${toolName} tool call found for session`);
  }

  // Execute the tool directly
  const searchTmdbTool = createSearchTmdbTool(db);
  const result = await searchTmdbTool.execute!(
    pending.input as { query: string; page: number },
    { toolCallId: `approved-${pending.id}`, messages: [] },
  );

  // Create a run and tool call record for the execution
  const run = await runs.createRun({ sessionId: session.id });
  const toolCallRecord = await runs.createToolCall({
    runId: run.id,
    toolName: pending.toolName,
    input: pending.input,
  });
  await runs.completeToolCall(toolCallRecord.id, { output: result, durationMs: 0 });
  await runs.completeRun(run.id);

  // Mark the original pending tool call as completed too
  await runs.completeToolCall(pending.id, { output: result, durationMs: 0 });

  return {
    sessionId: session.id,
    runId: run.id,
    toolCallId: `approved-${pending.id}`,
    toolName: pending.toolName,
    input: pending.input,
    result,
  };
}

export async function runOrchestrator({
  db,
  sessionId,
  userId,
  messages: incomingMessages,
}: OrchestratorParams): Promise<OrchestratorResult> {
  const sessions = agentSessionsRepository(db);
  const chatMessages = chatMessagesRepository(db);
  const runs = agentRunsRepository(db);

  // Find existing session or create a new one
  let session = sessionId
    ? await sessions.findById(sessionId)
    : null;

  if (!session) {
    session = await sessions.create(userId);
  }

  // Persist user message from incoming
  let userMessageId: string | null = null;
  const lastUserMessage = [...incomingMessages]
    .reverse()
    .find((m) => m.role === "user");
  if (lastUserMessage && typeof lastUserMessage.content === "string") {
    const created = await chatMessages.create({
      sessionId: session.id,
      role: "user",
      content: lastUserMessage.content,
    });
    userMessageId = created.id;
  }

  // Load conversation history from DB and convert to ModelMessage[]
  const previousMessages = await chatMessages.findBySessionId(session.id);
  const historyMessages: ModelMessage[] = previousMessages
    .slice(0, -1) // exclude the just-inserted user message (it's in incomingMessages)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content ?? "",
    }));

  const allMessages: ModelMessage[] = [...historyMessages, ...incomingMessages];

  // Create agent run
  const run = await runs.createRun({
    sessionId: session.id,
    messageId: userMessageId,
  });

  const stream = streamText({
    model: getModel(),
    system: SYSTEM_PROMPT,
    messages: allMessages,
    tools: {
      search_movies: createSearchMoviesTool(db),
      search_tmdb: createSearchTmdbTool(db),
    },
    stopWhen: stepCountIs(5),
    onFinish: async (event) => {
      try {
        // Persist tool calls from steps
        for (const step of event.steps) {
          for (const tc of step.toolCalls) {
            const toolCallRecord = await runs.createToolCall({
              runId: run.id,
              toolName: tc.toolName,
              input: tc.input,
            });

            const toolResult = step.toolResults.find(
              (tr) => tr.toolCallId === tc.toolCallId
            );

            if (toolResult) {
              await runs.completeToolCall(toolCallRecord.id, {
                output: toolResult.output,
                durationMs: 0,
              });
            }
          }
        }

        // Insert assistant message
        await chatMessages.create({
          sessionId: session.id,
          role: "assistant",
          content: event.text,
        });

        // Complete run
        await runs.completeRun(run.id);
      } catch (error) {
        await runs.failRun(
          run.id,
          error instanceof Error ? error.message : String(error)
        );
      }
    },
    onError: async ({ error }) => {
      await runs.failRun(
        run.id,
        error instanceof Error ? error.message : String(error)
      );
    },
  });

  return {
    sessionId: session.id,
    runId: run.id,
    stream,
  };
}
