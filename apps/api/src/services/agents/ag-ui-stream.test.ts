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

  it("tool-approval-request: emits TOOL_CALL_* without RESULT and attaches an approval interrupt to RUN_FINISHED", async () => {
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "search_tmdb",
        input: { query: "Stalker" },
      } as TextStreamPart<ToolSet>,
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

    const finished = events.find((e) => parseEventType(e) === "RUN_FINISHED");
    expect(finished).toBeDefined();
    expect(finished).toContain('"type":"interrupt"');
    expect(finished).toContain('"reason":"approval"');
    expect(finished).toContain('"id":"tc-1"');
  });

  it("needs-clarification tool-result: skips TOOL_CALL_RESULT and emits a clarification interrupt on RUN_FINISHED", async () => {
    const candidates = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        tmdbId: 1,
        title: "Dune",
        year: 1984,
        synopsis: null,
        genres: null,
        cast: null,
        directors: null,
        runtime: null,
        language: null,
        posterUrl: null,
        backdropUrl: null,
        popularity: null,
        releaseDate: null,
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        tmdbId: 2,
        title: "Dune",
        year: 2021,
        synopsis: null,
        genres: null,
        cast: null,
        directors: null,
        runtime: null,
        language: null,
        posterUrl: null,
        backdropUrl: null,
        popularity: null,
        releaseDate: null,
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
    ];

    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-clar",
        toolName: "review_delete",
        input: { title: "Dune" },
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-result",
        toolCallId: "tc-clar",
        toolName: "review_delete",
        input: { title: "Dune" },
        output: { kind: "needs-clarification", candidates },
      } as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), options);
    const events = await collectEvents(stream);
    const types = events.map(parseEventType);

    expect(types).not.toContain("TOOL_CALL_RESULT");

    const finished = events.find((e) => parseEventType(e) === "RUN_FINISHED");
    expect(finished).toBeDefined();
    expect(finished).toContain('"type":"interrupt"');
    expect(finished).toContain('"reason":"clarification"');
    expect(finished).toContain('"id":"tc-clar"');
    // Candidate ids land in the responseSchema enum
    expect(finished).toContain("11111111-1111-4111-8111-111111111111");
    expect(finished).toContain("22222222-2222-4222-8222-222222222222");
  });

  it("emits one CUSTOM:a2ui per a2uiMessage in order, before TOOL_CALL_RESULT", async () => {
    const a2uiMessages = [
      { createSurface: { surfaceId: "discovery", catalogId: "videoclub" } },
      {
        updateComponents: {
          surfaceId: "discovery",
          components: [{ id: "root", component: "Column", children: [] }],
        },
      },
      { updateDataModel: { surfaceId: "discovery", path: "/movies", value: [] } },
    ];

    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "discovery",
        input: { view: "grid" },
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "discovery",
        input: { view: "grid" },
        output: { data: { movies: [] }, a2uiMessages },
      } as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), options);
    const events = await collectEvents(stream);
    const types = events.map(parseEventType);

    const customIdxs = types
      .map((t, i) => (t === "CUSTOM" ? i : -1))
      .filter((i) => i >= 0);
    expect(customIdxs).toHaveLength(3);
    const resultIdx = types.indexOf("TOOL_CALL_RESULT");
    expect(customIdxs[customIdxs.length - 1]).toBeLessThan(resultIdx);

    const customEncoded = events[customIdxs[0]!]!;
    expect(customEncoded).toContain('"name":"a2ui"');
  });

  it("strips a2uiMessages from TOOL_CALL_RESULT content", async () => {
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "discovery",
        input: {},
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "discovery",
        input: {},
        output: {
          data: { movies: [{ id: "m1" }] },
          a2uiMessages: [{ createSurface: { surfaceId: "x", catalogId: "y" } }],
        },
      } as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), options);
    const events = await collectEvents(stream);
    const resultEvent = events.find((e) => parseEventType(e) === "TOOL_CALL_RESULT");
    expect(resultEvent).toBeDefined();
    expect(resultEvent).not.toContain("a2uiMessages");
    expect(resultEvent).toContain("\\\"data\\\"");
  });

  it("DEMO_MODE_SLEEP=100 inserts >=100ms gap between consecutive CUSTOM emissions", async () => {
    const original = process.env.DEMO_MODE_SLEEP;
    process.env.DEMO_MODE_SLEEP = "100";

    try {
      const a2uiMessages = [
        { createSurface: { surfaceId: "s", catalogId: "videoclub" } },
        { updateDataModel: { surfaceId: "s", path: "/x", value: 1 } },
      ];

      const parts: TextStreamPart<ToolSet>[] = [
        {
          type: "tool-call",
          toolCallId: "tc-1",
          toolName: "discovery",
          input: {},
        } as TextStreamPart<ToolSet>,
        {
          type: "tool-result",
          toolCallId: "tc-1",
          toolName: "discovery",
          input: {},
          output: { data: {}, a2uiMessages },
        } as TextStreamPart<ToolSet>,
      ];

      const stream = streamAgUiEvents(mockStream(parts), options);
      const stamps: number[] = [];
      for await (const event of stream) {
        if (parseEventType(event) === "CUSTOM") stamps.push(Date.now());
      }
      expect(stamps).toHaveLength(2);
      expect(stamps[1]! - stamps[0]!).toBeGreaterThanOrEqual(95);
    } finally {
      if (original === undefined) delete process.env.DEMO_MODE_SLEEP;
      else process.env.DEMO_MODE_SLEEP = original;
    }
  });

  it("emits CUSTOM:warning per warning entry and strips warnings from TOOL_CALL_RESULT", async () => {
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "discovery",
        input: {},
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "discovery",
        input: {},
        output: {
          data: { view: "grid" },
          warnings: [
            { code: "invalid-view", requested: "carousel" },
            { code: "comparison-too-few", count: 1 },
          ],
        },
      } as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), options);
    const events = await collectEvents(stream);
    const customEvents = events.filter(
      (e) => parseEventType(e) === "CUSTOM" && e.includes('"name":"warning"'),
    );
    expect(customEvents).toHaveLength(2);
    expect(customEvents[0]).toContain("invalid-view");
    expect(customEvents[1]).toContain("comparison-too-few");

    const resultEvent = events.find((e) => parseEventType(e) === "TOOL_CALL_RESULT")!;
    expect(resultEvent).not.toContain("warnings");
    expect(resultEvent).toContain("\\\"data\\\"");
  });

  it("does not emit CUSTOM:warning when warnings field is absent or empty", async () => {
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "discovery",
        input: {},
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "discovery",
        input: {},
        output: { data: { view: "grid" } },
      } as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), options);
    const events = await collectEvents(stream);
    const warningEvents = events.filter(
      (e) => parseEventType(e) === "CUSTOM" && e.includes('"name":"warning"'),
    );
    expect(warningEvents).toHaveLength(0);
  });

  it("does not emit CUSTOM when output has no a2uiMessages", async () => {
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "search_tmdb",
        input: { query: "x" },
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "search_tmdb",
        input: { query: "x" },
        output: [{ id: "m1" }],
      } as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), options);
    const events = await collectEvents(stream);
    const types = events.map(parseEventType);
    expect(types).not.toContain("CUSTOM");
  });

  it("emits RUN_ERROR on stream error", async () => {
    // eslint-disable-next-line require-yield
    async function* errorStream(): AsyncGenerator<TextStreamPart<ToolSet>> {
      throw new Error("Stream failed");
    }

    const stream = streamAgUiEvents(errorStream(), options);
    const events = await collectEvents(stream);
    const types = events.map(parseEventType);

    expect(types).toContain("RUN_ERROR");
  });
});
