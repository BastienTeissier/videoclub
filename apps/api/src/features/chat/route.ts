import { Hono } from "hono";
import type { ModelMessage } from "ai";
import { chatRequestSchema } from "@repo/contracts";
import { db } from "../../lib/db.js";
import { runOrchestrator } from "../../services/agents/orchestrator.js";

type Variables = {
  userId: string;
};

const chat = new Hono<{ Variables: Variables }>();

chat.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = chatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request: message is required" }, 400);
  }

  const userId = c.get("userId");
  const messages: ModelMessage[] = [
    { role: "user", content: parsed.data.message },
  ];

  const result = await runOrchestrator({
    db,
    sessionId: parsed.data.sessionId,
    userId,
    messages,
  });

  return c.json(result);
});

export { chat };
