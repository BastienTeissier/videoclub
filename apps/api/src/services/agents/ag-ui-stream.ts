import { EventEncoder } from "@ag-ui/encoder";
import { EventType } from "@ag-ui/core";
import type { TextStreamPart, ToolSet } from "ai";

interface StreamAgUiOptions {
  threadId: string;
  runId: string;
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
          yield encoder.encode({
            type: EventType.TOOL_CALL_RESULT,
            toolCallId: part.toolCallId,
            messageId: `tool-result-${part.toolCallId}`,
            content: JSON.stringify(part.output),
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
