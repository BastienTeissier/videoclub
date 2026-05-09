import { Hono } from "hono";
import { db } from "../../lib/db.js";
import { agentRun } from "../../services/agents/agent-run.js";
import { runAgentInputSchema } from "./ag-ui-schema.js";
import {
  agUiToAiSdk,
  extractInterruptResponse,
} from "../../services/agents/message-translator.js";

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
  const events = interrupt
    ? run.resume({
        userId,
        threadId,
        runId,
        interruptId: interrupt.interruptId,
        response: interrupt.response,
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
