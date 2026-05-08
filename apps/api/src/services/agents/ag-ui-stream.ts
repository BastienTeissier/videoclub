import { EventEncoder } from "@ag-ui/encoder";
import { EventType } from "@ag-ui/core";
import type { TextStreamPart, ToolSet } from "ai";
import type { A2UIMessage } from "@repo/contracts";

interface StreamAgUiOptions {
  threadId: string;
  runId: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDemoSleepMs(): number {
  const raw = process.env.DEMO_MODE_SLEEP;
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function extractA2UIMessages(output: unknown): A2UIMessage[] | undefined {
  if (!output || typeof output !== "object") return undefined;
  const maybe = (output as { a2uiMessages?: unknown }).a2uiMessages;
  return Array.isArray(maybe) ? (maybe as A2UIMessage[]) : undefined;
}

function stripA2UIMessages(output: unknown): unknown {
  if (!output || typeof output !== "object" || !("a2uiMessages" in output)) {
    return output;
  }
  const { a2uiMessages: _ignored, ...rest } = output as Record<string, unknown>;
  void _ignored;
  return rest;
}

export async function* streamAgUiEvents(
  fullStream: AsyncIterable<TextStreamPart<ToolSet>>,
  { threadId, runId }: StreamAgUiOptions
): AsyncGenerator<string> {
  const encoder = new EventEncoder();
  let textStarted = false;
  let messageId = `msg-${runId}`;

  // Emit RUN_STARTED
  yield encoder.encode({
    type: EventType.RUN_STARTED,
    threadId,
    runId,
  });

  try {
    for await (const part of fullStream) {
      switch (part.type) {
        case "text-delta": {
          if (!textStarted) {
            textStarted = true;
            yield encoder.encode({
              type: EventType.TEXT_MESSAGE_START,
              messageId,
              role: "assistant",
            });
          }
          yield encoder.encode({
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId,
            delta: part.text,
          });
          break;
        }

        case "text-end": {
          if (textStarted) {
            yield encoder.encode({
              type: EventType.TEXT_MESSAGE_END,
              messageId,
            });
            textStarted = false;
            messageId = `msg-${runId}-${Date.now()}`;
          }
          break;
        }

        case "tool-call": {
          const toolCallId = part.toolCallId;
          const toolName = part.toolName;
          const args = JSON.stringify(part.input);

          yield encoder.encode({
            type: EventType.TOOL_CALL_START,
            toolCallId,
            toolCallName: toolName,
          });
          yield encoder.encode({
            type: EventType.TOOL_CALL_ARGS,
            toolCallId,
            delta: args,
          });
          yield encoder.encode({
            type: EventType.TOOL_CALL_END,
            toolCallId,
          });
          break;
        }

        case "tool-result": {
          const a2uiMessages = extractA2UIMessages(part.output);
          if (a2uiMessages) {
            const sleepMs = getDemoSleepMs();
            for (let i = 0; i < a2uiMessages.length; i++) {
              if (sleepMs > 0 && i > 0) await sleep(sleepMs);
              yield encoder.encode({
                type: EventType.CUSTOM,
                name: "a2ui",
                value: a2uiMessages[i],
              });
            }
          }
          const sanitizedOutput = stripA2UIMessages(part.output);
          yield encoder.encode({
            type: EventType.TOOL_CALL_RESULT,
            toolCallId: part.toolCallId,
            messageId: `tool-result-${part.toolCallId}`,
            content: JSON.stringify(sanitizedOutput),
          });
          break;
        }

        case "tool-approval-request": {
          // AI SDK emits a `tool-call` event before `tool-approval-request`
          // for the same tool, so TOOL_CALL_START/ARGS/END are already sent.
          // We intentionally emit nothing here — the absence of a
          // TOOL_CALL_RESULT signals pending approval to the frontend.
          break;
        }

        case "error": {
          yield encoder.encode({
            type: EventType.RUN_ERROR,
            message: part.error instanceof Error ? part.error.message : String(part.error),
          });
          return;
        }

        default:
          // Ignore other stream parts (start-step, finish-step, reasoning, etc.)
          break;
      }
    }

    // Close any open text message
    if (textStarted) {
      yield encoder.encode({
        type: EventType.TEXT_MESSAGE_END,
        messageId,
      });
    }

    // Emit RUN_FINISHED
    yield encoder.encode({
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
    });
  } catch (error) {
    yield encoder.encode({
      type: EventType.RUN_ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
