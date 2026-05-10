import { EventEncoder } from "@ag-ui/encoder";
import { EventType } from "@ag-ui/core";
import type { TextStreamPart, ToolSet } from "ai";
import {
  clarificationInterrupt,
  type A2UIMessage,
  type Interrupt,
  type MovieDto,
} from "@repo/contracts";

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
  return rest;
}

function asNeedsClarification(
  output: unknown,
): { candidates: MovieDto[] } | null {
  if (!output || typeof output !== "object") return null;
  const o = output as { kind?: unknown; candidates?: unknown };
  if (o.kind !== "needs-clarification") return null;
  if (!Array.isArray(o.candidates)) return null;
  return { candidates: o.candidates as MovieDto[] };
}

function approvalInterrupt(
  toolCallId: string,
  toolName: string,
  input: unknown,
): Interrupt {
  return {
    id: toolCallId,
    reason: "approval",
    message: `Approve calling ${toolName}?`,
    proposed: { toolName, input },
    responseSchema: {
      type: "object",
      properties: {
        approved: { type: "boolean" },
      },
      required: ["approved"],
    },
  };
}

interface TextState {
  textStarted: boolean;
  messageId: string;
}

function* emitTextDelta(
  text: string,
  encoder: EventEncoder,
  state: TextState,
): Generator<string> {
  if (!state.textStarted) {
    state.textStarted = true;
    yield encoder.encode({
      type: EventType.TEXT_MESSAGE_START,
      messageId: state.messageId,
      role: "assistant",
    });
  }
  yield encoder.encode({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: state.messageId,
    delta: text,
  });
}

function* emitTextEnd(
  runId: string,
  encoder: EventEncoder,
  state: TextState,
): Generator<string> {
  if (!state.textStarted) return;
  yield encoder.encode({
    type: EventType.TEXT_MESSAGE_END,
    messageId: state.messageId,
  });
  state.textStarted = false;
  state.messageId = `msg-${runId}-${Date.now()}`;
}

function* emitToolCall(
  toolCallId: string,
  toolName: string,
  input: unknown,
  encoder: EventEncoder,
): Generator<string> {
  yield encoder.encode({
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: toolName,
  });
  yield encoder.encode({
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: JSON.stringify(input),
  });
  yield encoder.encode({
    type: EventType.TOOL_CALL_END,
    toolCallId,
  });
}

async function* emitToolResult(
  toolCallId: string,
  output: unknown,
  encoder: EventEncoder,
  pendingInterrupts: Interrupt[],
): AsyncGenerator<string> {
  const clarification = asNeedsClarification(output);
  if (clarification) {
    // Do NOT emit TOOL_CALL_RESULT; the marker is server-only.
    pendingInterrupts.push(
      clarificationInterrupt(toolCallId, clarification.candidates),
    );
    return;
  }

  const a2uiMessages = extractA2UIMessages(output);
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
  yield encoder.encode({
    type: EventType.TOOL_CALL_RESULT,
    toolCallId,
    messageId: `tool-result-${toolCallId}`,
    content: JSON.stringify(stripA2UIMessages(output)),
  });
}

function encodeRunFinished(
  encoder: EventEncoder,
  threadId: string,
  runId: string,
  pendingInterrupts: Interrupt[],
): string {
  if (pendingInterrupts.length > 0) {
    return encoder.encode({
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      result: { type: "interrupt", interrupts: pendingInterrupts },
    });
  }
  return encoder.encode({ type: EventType.RUN_FINISHED, threadId, runId });
}

function encodeError(encoder: EventEncoder, err: unknown): string {
  return encoder.encode({
    type: EventType.RUN_ERROR,
    message: err instanceof Error ? err.message : String(err),
  });
}

export async function* streamAgUiEvents(
  fullStream: AsyncIterable<TextStreamPart<ToolSet>>,
  { threadId, runId }: StreamAgUiOptions,
): AsyncGenerator<string> {
  const encoder = new EventEncoder();
  const state: TextState = { textStarted: false, messageId: `msg-${runId}` };
  // Clarification: detected on tool-result with kind: "needs-clarification".
  // Approval: detected on tool-approval-request (HITL).
  const pendingInterrupts: Interrupt[] = [];

  yield encoder.encode({ type: EventType.RUN_STARTED, threadId, runId });

  try {
    for await (const part of fullStream) {
      switch (part.type) {
        case "text-delta":
          yield* emitTextDelta(part.text, encoder, state);
          break;
        case "text-end":
          yield* emitTextEnd(runId, encoder, state);
          break;
        case "tool-call":
          yield* emitToolCall(
            part.toolCallId,
            part.toolName,
            part.input,
            encoder,
          );
          break;
        case "tool-result":
          yield* emitToolResult(
            part.toolCallId,
            part.output,
            encoder,
            pendingInterrupts,
          );
          break;
        case "tool-approval-request": {
          // AI SDK emits `tool-call` before `tool-approval-request` for the
          // same tool, so TOOL_CALL_START/ARGS/END are already sent.
          const { toolCallId, toolName, input } = part.toolCall;
          pendingInterrupts.push(approvalInterrupt(toolCallId, toolName, input));
          break;
        }
        case "error":
          yield encodeError(encoder, part.error);
          return;
        default:
          // Ignore other stream parts (start-step, finish-step, reasoning, etc.)
          break;
      }
    }

    if (state.textStarted) {
      yield encoder.encode({
        type: EventType.TEXT_MESSAGE_END,
        messageId: state.messageId,
      });
    }
    yield encodeRunFinished(encoder, threadId, runId, pendingInterrupts);
  } catch (error) {
    yield encodeError(encoder, error);
  }
}
