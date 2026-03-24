import { generateText, stepCountIs } from "ai";
import { getModel } from "../../lib/ai-provider.js";
import { createSearchMoviesTool } from "../../features/tools/search-movies.js";
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

Always use the search_movies tool to find movies — do not make up movie information.`;

interface OrchestratorParams {
  db: Database;
  sessionId?: string;
  userId: string;
  message: string;
}

export async function runOrchestrator({
  db,
  sessionId,
  userId,
  message,
}: OrchestratorParams) {
  const sessions = agentSessionsRepository(db);
  const messages = chatMessagesRepository(db);
  const runs = agentRunsRepository(db);

  // Get or create session
  const session = sessionId
    ? await sessions.findById(sessionId)
    : await sessions.create(userId);

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Insert user message
  const userMessage = await messages.create({
    sessionId: session.id,
    role: "user",
    content: message,
  });

  // Create agent run
  const run = await runs.createRun({
    sessionId: session.id,
    messageId: userMessage.id,
  });

  try {
    const result = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      prompt: message,
      tools: {
        search_movies: createSearchMoviesTool(db),
      },
      stopWhen: stepCountIs(5),
    });

    // Persist tool calls from steps
    const toolResults: { toolName: string; input: unknown; output: unknown }[] =
      [];

    for (const step of result.steps) {
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
          toolResults.push({
            toolName: tc.toolName,
            input: tc.input,
            output: toolResult.output,
          });
        }
      }
    }

    // Insert assistant message
    await messages.create({
      sessionId: session.id,
      role: "assistant",
      content: result.text,
    });

    // Complete run
    await runs.completeRun(run.id);

    return {
      sessionId: session.id,
      response: result.text,
      toolResults,
    };
  } catch (error) {
    await runs.failRun(
      run.id,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}
