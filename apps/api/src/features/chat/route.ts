import { Hono } from "hono";
import { db } from "../../lib/db.js";
import { runOrchestrator } from "../../services/agents/orchestrator.js";
import { runAgentInputSchema } from "./ag-ui-schema.js";
import { agUiToAiSdk } from "../../services/agents/message-translator.js";
import { streamAgUiEvents } from "../../services/agents/ag-ui-stream.js";

type Variables = {
  userId: string;
};

const chat = new Hono<{ Variables: Variables }>();

chat.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = runAgentInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
  }

  const userId = c.get("userId");
  const { threadId, runId, messages: agUiMessages } = parsed.data;

  const aiSdkMessages = agUiToAiSdk(agUiMessages);

  const result = await runOrchestrator({
    db,
    sessionId: threadId,
    userId,
    messages: aiSdkMessages,
  });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const encoder = new TextEncoder();
        for await (const event of streamAgUiEvents(result.stream.fullStream, {
          threadId: result.sessionId,
          runId,
        })) {
          controller.enqueue(encoder.encode(event));
        }
        controller.close();
      } catch {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

export { chat };
