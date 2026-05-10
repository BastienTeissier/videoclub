import { Hono } from "hono";
import { z } from "zod";
import {
  clarificationResponseSchema,
  commitMovieNightResponseSchema,
} from "@repo/contracts";
import { agentRunsRepository } from "@repo/db";
import { db } from "../../lib/db.js";
import { agentRun } from "../../services/agents/agent-run.js";
import { runAgentInputSchema } from "./ag-ui-schema.js";
import {
  agUiToAiSdk,
  extractInterruptResponse,
} from "../../services/agents/message-translator.js";

// Per-tool registry: validates `forwardedProps.interruptResponse.response`
// against the schema the matching interrupt builder declared. Tools whose
// resume payload only carries `{ approved: boolean }` (legacy `search_tmdb`)
// fall back to the generic shape.
const APPROVAL_RESPONSE_SCHEMAS: Record<string, z.ZodTypeAny> = {
  commit_movie_night: commitMovieNightResponseSchema,
  search_tmdb: z.object({ approved: z.boolean() }),
};

type Variables = {
  userId: string;
};

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

const chat = new Hono<{ Variables: Variables }>();

chat.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = runAgentInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid request", details: parsed.error.issues },
      400,
    );
  }

  const userId = c.get("userId");
  const {
    threadId,
    runId,
    messages: agUiMessages,
    forwardedProps,
  } = parsed.data;

  const interrupt = extractInterruptResponse(forwardedProps);
  const run = agentRun(db);

  let resumeResponse: unknown = null;
  if (interrupt) {
    const pending = await agentRunsRepository(db).findToolCallByAiSdkCallId(
      interrupt.interruptId,
    );
    if (!pending) {
      return c.json({ error: "Unknown interrupt" }, 404);
    }
    if (pending.output !== null) {
      return c.json({ error: "Interrupt already resolved" }, 409);
    }
    const schema =
      APPROVAL_RESPONSE_SCHEMAS[pending.toolName] ??
      clarificationResponseSchema;
    const validated = schema.safeParse(interrupt.response);
    if (!validated.success) {
      return c.json(
        { error: "Invalid response", issues: validated.error.issues },
        422,
      );
    }
    resumeResponse = validated.data;
  }

  const events = interrupt
    ? run.resume({
        userId,
        threadId,
        runId,
        interruptId: interrupt.interruptId,
        response: resumeResponse,
      })
    : run.start({
        userId,
        threadId,
        runId,
        messages: agUiToAiSdk(agUiMessages),
      });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const encoder = new TextEncoder();
        for await (const event of events) {
          controller.enqueue(encoder.encode(event));
        }
        controller.close();
      } catch {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
});

export { chat };
