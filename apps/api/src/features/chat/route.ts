import { Hono } from "hono";
import { EventEncoder } from "@ag-ui/encoder";
import { EventType } from "@ag-ui/core";
import { db } from "../../lib/db.js";
import { runOrchestrator, runApprovedTool } from "../../services/agents/orchestrator.js";
import { runAgentInputSchema } from "./ag-ui-schema.js";
import { agUiToAiSdk, extractApprovalResponses } from "../../services/agents/message-translator.js";
import { streamAgUiEvents } from "../../services/agents/ag-ui-stream.js";

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
    return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
  }

  const userId = c.get("userId");
  const { threadId, runId, messages: agUiMessages } = parsed.data;

  // Check if this is a tool approval
  const approvals = extractApprovalResponses(agUiMessages);
  const approval = approvals.find((a) => a.approved);

  if (approval && threadId) {
    return new Response(
      buildApprovalStream({
        threadId,
        runId,
        userId,
        toolName: approval.toolName || "search_tmdb",
      }),
      { headers: SSE_HEADERS },
    );
  }

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

  return new Response(stream, { headers: SSE_HEADERS });
});

function buildApprovalStream(params: {
  threadId: string;
  runId: string;
  userId: string;
  toolName: string;
}): ReadableStream {
  const agUiEncoder = new EventEncoder();
  const textEncoder = new TextEncoder();

  const encode = (event: Parameters<EventEncoder["encode"]>[0]) =>
    textEncoder.encode(agUiEncoder.encode(event));

  return new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          encode({
            type: EventType.RUN_STARTED,
            threadId: params.threadId,
            runId: params.runId,
          }),
        );

        const result = await runApprovedTool({
          db,
          sessionId: params.threadId,
          userId: params.userId,
          toolName: params.toolName,
        });

        controller.enqueue(
          encode({
            type: EventType.TOOL_CALL_START,
            toolCallId: result.toolCallId,
            toolCallName: result.toolName,
          }),
        );
        controller.enqueue(
          encode({
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: result.toolCallId,
            delta: JSON.stringify(result.input),
          }),
        );
        controller.enqueue(
          encode({
            type: EventType.TOOL_CALL_END,
            toolCallId: result.toolCallId,
          }),
        );
        controller.enqueue(
          encode({
            type: EventType.TOOL_CALL_RESULT,
            toolCallId: result.toolCallId,
            messageId: `tool-result-${result.toolCallId}`,
            content: JSON.stringify(result.result),
          }),
        );
        controller.enqueue(
          encode({
            type: EventType.RUN_FINISHED,
            threadId: params.threadId,
            runId: params.runId,
          }),
        );
        controller.close();
      } catch (error) {
        controller.enqueue(
          encode({
            type: EventType.RUN_ERROR,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        controller.close();
      }
    },
  });
}

export { chat };
