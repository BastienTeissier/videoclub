import { describe, it, expect } from "vitest";
import { streamAgUiEvents } from "./ag-ui-stream.js";
import type { TextStreamPart, ToolSet } from "ai";

async function collectEvents(
  stream: AsyncGenerator<string>
): Promise<string[]> {
  const events: string[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function parseEventType(encoded: string): string | undefined {
  // AG-UI encoder outputs JSON with "type" field
  try {
    const match = encoded.match(/"type"\s*:\s*"([^"]+)"/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

async function* mockStream(
  parts: TextStreamPart<ToolSet>[]
): AsyncGenerator<TextStreamPart<ToolSet>> {
  for (const part of parts) {
    yield part;
  }
}

describe("streamAgUiEvents", () => {
  const options = { threadId: "thread-1", runId: "run-1" };

  it("emits RUN_STARTED and RUN_FINISHED", async () => {
    const stream = streamAgUiEvents(mockStream([]), options);
    const events = await collectEvents(stream);
    const types = events.map(parseEventType);

    expect(types[0]).toBe("RUN_STARTED");
    expect(types[types.length - 1]).toBe("RUN_FINISHED");
  });

  it("maps text deltas to TEXT_MESSAGE_START/CONTENT/END", async () => {
    const parts: TextStreamPart<ToolSet>[] = [
      { type: "text-delta", id: "t1", text: "Hello " },
      { type: "text-delta", id: "t1", text: "world" },
      { type: "text-end", id: "t1" },
    ];

    const stream = streamAgUiEvents(mockStream(parts), options);
    const events = await collectEvents(stream);
    const types = events.map(parseEventType);

    expect(types).toContain("TEXT_MESSAGE_START");
    expect(types).toContain("TEXT_MESSAGE_CONTENT");
    expect(types).toContain("TEXT_MESSAGE_END");

    // TEXT_MESSAGE_START should appear before CONTENT
    const startIdx = types.indexOf("TEXT_MESSAGE_START");
    const contentIdx = types.indexOf("TEXT_MESSAGE_CONTENT");
    const endIdx = types.indexOf("TEXT_MESSAGE_END");
    expect(startIdx).toBeLessThan(contentIdx);
    expect(contentIdx).toBeLessThan(endIdx);
  });

  it("maps auto-executed tool call to TOOL_CALL lifecycle", async () => {
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "search_movies",
        input: { title: "test" },
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "search_movies",
        input: { title: "test" },
        output: [{ id: "m1" }],
      } as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), options);
    const events = await collectEvents(stream);
    const types = events.map(parseEventType);

    expect(types).toContain("TOOL_CALL_START");
    expect(types).toContain("TOOL_CALL_ARGS");
    expect(types).toContain("TOOL_CALL_END");
    expect(types).toContain("TOOL_CALL_RESULT");
  });

  it("maps tool-approval-request to TOOL_CALL without RESULT", async () => {
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-approval-request",
        approvalId: "ap-1",
        toolCall: {
          type: "tool-call",
          toolCallId: "tc-1",
          toolName: "search_tmdb",
          args: { query: "Stalker" },
        },
      } as unknown as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), options);
    const events = await collectEvents(stream);
    const types = events.map(parseEventType);

    expect(types).toContain("TOOL_CALL_START");
    expect(types).toContain("TOOL_CALL_ARGS");
    expect(types).toContain("TOOL_CALL_END");
    expect(types).not.toContain("TOOL_CALL_RESULT");
  });

  it("emits RUN_ERROR on stream error", async () => {
    async function* errorStream(): AsyncGenerator<TextStreamPart<ToolSet>> {
      throw new Error("Stream failed");
    }

    const stream = streamAgUiEvents(errorStream(), options);
    const events = await collectEvents(stream);
    const types = events.map(parseEventType);

    expect(types).toContain("RUN_ERROR");
  });
});
