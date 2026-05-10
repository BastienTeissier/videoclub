import { describe, it, expect } from "vitest";
import { agUiToAiSdk, extractInterruptResponse } from "./message-translator.js";
import type { AgUiMessage } from "../../features/chat/ag-ui-schema.js";

describe("agUiToAiSdk", () => {
  it("translates user message", () => {
    const messages: AgUiMessage[] = [
      { role: "user", id: "1", content: "hello" },
    ];

    const result = agUiToAiSdk(messages);

    expect(result).toEqual([{ role: "user", content: "hello" }]);
  });

  it("translates assistant message with tool calls", () => {
    const messages: AgUiMessage[] = [
      {
        role: "assistant",
        id: "2",
        content: "Let me search",
        toolCalls: [
          {
            id: "tc-1",
            type: "function",
            function: {
              name: "search_movies",
              arguments: '{"title":"Jaws"}',
            },
          },
        ],
      },
    ];

    const result = agUiToAiSdk(messages);

    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("assistant");
    const content = result[0]!.content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(2); // text + tool-call
    expect(content[0]).toEqual({ type: "text", text: "Let me search" });
    expect(content[1]).toMatchObject({
      type: "tool-call",
      toolCallId: "tc-1",
      toolName: "search_movies",
      input: { title: "Jaws" },
    });
  });

  it("handles empty messages array", () => {
    expect(agUiToAiSdk([])).toEqual([]);
  });
});

describe("extractInterruptResponse", () => {
  it("returns null when forwardedProps is absent", () => {
    expect(extractInterruptResponse(undefined)).toBeNull();
  });

  it("returns null when forwardedProps has no interruptResponse", () => {
    expect(extractInterruptResponse({})).toBeNull();
  });

  it("extracts a structured interrupt response", () => {
    const result = extractInterruptResponse({
      interruptResponse: {
        interruptId: "call_abc",
        response: { pickedMovieId: "movie-42" },
      },
    });

    expect(result).toEqual({
      interruptId: "call_abc",
      response: { pickedMovieId: "movie-42" },
    });
  });

  it("ignores invalid shapes gracefully", () => {
    expect(
      extractInterruptResponse({
        interruptResponse: { interruptId: 123 } as never,
      }),
    ).toBeNull();
  });
});
