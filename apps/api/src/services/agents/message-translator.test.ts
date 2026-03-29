import { describe, it, expect } from "vitest";
import { agUiToAiSdk, extractApprovalResponses } from "./message-translator.js";
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
      args: { title: "Jaws" },
    });
  });

  it("extracts approval responses from tool messages", () => {
    const messages: AgUiMessage[] = [
      {
        role: "tool",
        id: "t-1",
        toolCallId: "tc-1",
        content: JSON.stringify({ approved: true, toolName: "search_tmdb" }),
      },
    ];

    const approvals = extractApprovalResponses(messages);

    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toEqual({
      toolCallId: "tc-1",
      toolName: "search_tmdb",
      approved: true,
    });
  });

  it("handles empty messages array", () => {
    expect(agUiToAiSdk([])).toEqual([]);
    expect(extractApprovalResponses([])).toEqual([]);
  });
});
