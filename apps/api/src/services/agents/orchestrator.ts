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

If local search results are insufficient (0 results, results don't match user intent, or user explicitly asks for more), propose search_tmdb to search TMDB for additional results. Do NOT propose search_tmdb when local results already satisfy the query.`;

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

export async function runOrchestrator({
  db,
  sessionId,
  userId,
  messages: incomingMessages,
}: OrchestratorParams): Promise<OrchestratorResult> {
  const sessions = agentSessionsRepository(db);
  const chatMessages = chatMessagesRepository(db);
  const runs = agentRunsRepository(db);

  // Get or create session
  const session = sessionId
    ? await sessions.findById(sessionId)
    : await sessions.create(userId);

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Persist user messages from incoming
  const lastUserMessage = [...incomingMessages]
    .reverse()
    .find((m) => m.role === "user");
  if (lastUserMessage && typeof lastUserMessage.content === "string") {
    await chatMessages.create({
      sessionId: session.id,
      role: "user",
      content: lastUserMessage.content,
    });
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
  const userMsg = previousMessages[previousMessages.length - 1];
  const run = await runs.createRun({
    sessionId: session.id,
    messageId: userMsg?.id ?? session.id,
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
