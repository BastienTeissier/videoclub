import { describe, it, expect } from "vitest";
import { streamAgUiEvents, stripUiNoise } from "./ag-ui-stream.js";
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

  it("tool-approval-request for commit_movie_night with valid input: emits typed interrupt with editedReason textarea", async () => {
    const validInput = {
      pickedMovieId: "11111111-1111-4111-8111-111111111111",
      backupMovieIds: ["22222222-2222-4222-8222-222222222222"],
      reason: "feel-good",
    };
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-c",
        toolName: "commit_movie_night",
        input: validInput,
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-approval-request",
        approvalId: "ap-c",
        toolCall: {
          type: "tool-call",
          toolCallId: "tc-c",
          toolName: "commit_movie_night",
          args: validInput,
          input: validInput,
        },
      } as unknown as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), options);
    const events = await collectEvents(stream);
    const finished = events.find((e) => parseEventType(e) === "RUN_FINISHED");
    expect(finished).toBeDefined();
    expect(finished).toContain('"reason":"approval"');
    expect(finished).toContain('"ui:widget":"textarea"');
    expect(finished).toContain(validInput.pickedMovieId);
  });

  it("tool-approval-request for commit_movie_night with malformed input: falls back to generic approval interrupt", async () => {
    const badInput = { pickedMovieId: "not-a-uuid", backupMovieIds: [], reason: "x" };
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-bad",
        toolName: "commit_movie_night",
        input: badInput,
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-approval-request",
        approvalId: "ap-bad",
        toolCall: {
          type: "tool-call",
          toolCallId: "tc-bad",
          toolName: "commit_movie_night",
          args: badInput,
          input: badInput,
        },
      } as unknown as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), options);
    const events = await collectEvents(stream);
    const finished = events.find((e) => parseEventType(e) === "RUN_FINISHED")!;
    // Generic shape: no editedReason key in responseSchema.
    expect(finished).not.toContain('"ui:widget":"textarea"');
    expect(finished).toContain('"reason":"approval"');
    expect(finished).toContain('Approve calling commit_movie_night');
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

describe("stripUiNoise", () => {
  it("removes a2uiMessages and warnings while preserving other keys", () => {
    const out = stripUiNoise({
      data: { movies: [{ id: "m1" }], view: "grid" },
      a2uiMessages: [{ createSurface: { surfaceId: "x", catalogId: "videoclub" } }],
      warnings: [{ code: "invalid-view" }],
    });
    expect(out).toEqual({ data: { movies: [{ id: "m1" }], view: "grid" } });
  });

  it("returns the original output unchanged when neither key is present", () => {
    const out = stripUiNoise({ data: { x: 1 } });
    expect(out).toEqual({ data: { x: 1 } });
  });

  it("returns non-objects untouched", () => {
    expect(stripUiNoise(null)).toBe(null);
    expect(stripUiNoise("string")).toBe("string");
    expect(stripUiNoise(42)).toBe(42);
  });

  it("strips jsonPatchOps from update_preferences-shaped output", () => {
    const out = stripUiNoise({
      data: { genres: ["Comedy"] },
      jsonPatchOps: [{ op: "add", path: "/genres", value: ["Comedy"] }],
    });
    expect(out).toEqual({ data: { genres: ["Comedy"] } });
  });
});

describe("streamAgUiEvents — memory state", () => {
  const baseOptions = { threadId: "thread-1", runId: "run-1" };

  function parseEvent(encoded: string): Record<string, unknown> {
    return JSON.parse(encoded.replace(/^data: /, "").replace(/\n\n$/, ""));
  }

  it("emits STATE_SNAPSHOT immediately after RUN_STARTED when memory is provided", async () => {
    const memory = { snapshot: { genres: ["Comedy"] } };
    const stream = streamAgUiEvents(mockStream([]), {
      ...baseOptions,
      memory,
    });
    const events = await collectEvents(stream);
    const types = events.map(parseEventType);

    expect(types[0]).toBe("RUN_STARTED");
    expect(types[1]).toBe("STATE_SNAPSHOT");
    const snap = parseEvent(events[1]!);
    expect(snap.snapshot).toEqual({ genres: ["Comedy"] });
  });

  it("emits STATE_SNAPSHOT with an empty snapshot", async () => {
    const stream = streamAgUiEvents(mockStream([]), {
      ...baseOptions,
      memory: { snapshot: {} },
    });
    const events = await collectEvents(stream);
    expect(parseEventType(events[1]!)).toBe("STATE_SNAPSHOT");
    expect(parseEvent(events[1]!).snapshot).toEqual({});
  });

  it("does not emit STATE_SNAPSHOT when memory is undefined", async () => {
    const stream = streamAgUiEvents(mockStream([]), baseOptions);
    const events = await collectEvents(stream);
    expect(events.map(parseEventType)).not.toContain("STATE_SNAPSHOT");
  });

  it("emits STATE_DELTA before TOOL_CALL_RESULT for update_preferences results", async () => {
    const memory = { snapshot: {} as Record<string, unknown> };
    const ops = [
      { op: "add", path: "/genres", value: ["Comedy"] },
    ];
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "update_preferences",
        input: { genres: ["Comedy"] },
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "update_preferences",
        input: { genres: ["Comedy"] },
        output: { data: { genres: ["Comedy"] }, jsonPatchOps: ops },
      } as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), {
      ...baseOptions,
      memory,
    });
    const events = await collectEvents(stream);
    const types = events.map(parseEventType);
    const deltaIdx = types.indexOf("STATE_DELTA");
    const resultIdx = types.indexOf("TOOL_CALL_RESULT");
    expect(deltaIdx).toBeGreaterThan(-1);
    expect(deltaIdx).toBeLessThan(resultIdx);

    const delta = parseEvent(events[deltaIdx]!);
    expect(delta.delta).toEqual(ops);
  });

  it("mutates memoryRef.snapshot after emitting STATE_DELTA", async () => {
    const memory = { snapshot: {} as Record<string, unknown> };
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "update_preferences",
        input: { genres: ["Drama"] },
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "update_preferences",
        input: { genres: ["Drama"] },
        output: {
          data: { genres: ["Drama"] },
          jsonPatchOps: [{ op: "add", path: "/genres", value: ["Drama"] }],
        },
      } as TextStreamPart<ToolSet>,
    ];

    await collectEvents(
      streamAgUiEvents(mockStream(parts), { ...baseOptions, memory }),
    );

    expect(memory.snapshot).toEqual({ genres: ["Drama"] });
  });

  it("emits CUSTOM:memory-applied between TOOL_CALL_END and TOOL_CALL_RESULT for discovery with overlapping filters", async () => {
    const memory = { snapshot: { genres: ["Comedy"] } };
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "discovery",
        input: { view: "grid", filters: { genres: ["Comedy"] } },
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "discovery",
        input: { view: "grid", filters: { genres: ["Comedy"] } },
        output: { data: { movies: [], view: "grid" } },
      } as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), {
      ...baseOptions,
      memory,
    });
    const events = await collectEvents(stream);
    const memoryAppliedIdx = events.findIndex(
      (e) => parseEventType(e) === "CUSTOM" && e.includes('"name":"memory-applied"'),
    );
    const endIdx = events.map(parseEventType).indexOf("TOOL_CALL_END");
    const resultIdx = events.map(parseEventType).indexOf("TOOL_CALL_RESULT");
    expect(memoryAppliedIdx).toBeGreaterThan(endIdx);
    expect(memoryAppliedIdx).toBeLessThan(resultIdx);

    const event = parseEvent(events[memoryAppliedIdx]!);
    expect((event.value as { keys: string[] }).keys).toEqual(["genres"]);
  });

  it("does not emit memory-applied when discovery filters are absent", async () => {
    const memory = { snapshot: { genres: ["Comedy"] } };
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "discovery",
        input: { view: "grid" },
      } as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), {
      ...baseOptions,
      memory,
    });
    const events = await collectEvents(stream);
    const memoryApplied = events.find((e) =>
      e.includes('"name":"memory-applied"'),
    );
    expect(memoryApplied).toBeUndefined();
  });

  it("does not emit memory-applied when filters do not overlap the snapshot", async () => {
    const memory = { snapshot: { genres: ["Comedy"] } };
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "discovery",
        input: { view: "grid", filters: { title: "Dune" } },
      } as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), {
      ...baseOptions,
      memory,
    });
    const events = await collectEvents(stream);
    const memoryApplied = events.find((e) =>
      e.includes('"name":"memory-applied"'),
    );
    expect(memoryApplied).toBeUndefined();
  });

  it("emits memory-applied against an in-flight snapshot updated by a prior STATE_DELTA", async () => {
    const memory = { snapshot: {} as Record<string, unknown> };
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "update_preferences",
        input: { genres: ["Comedy"] },
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "update_preferences",
        input: { genres: ["Comedy"] },
        output: {
          data: { genres: ["Comedy"] },
          jsonPatchOps: [{ op: "add", path: "/genres", value: ["Comedy"] }],
        },
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-call",
        toolCallId: "tc-2",
        toolName: "discovery",
        input: { view: "grid", filters: { genres: ["Comedy"] } },
      } as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), {
      ...baseOptions,
      memory,
    });
    const events = await collectEvents(stream);
    const memoryApplied = events.find((e) =>
      e.includes('"name":"memory-applied"'),
    );
    expect(memoryApplied).toBeDefined();
    expect(memoryApplied).toContain('"keys":["genres"]');
  });

  it("strips jsonPatchOps from update_preferences TOOL_CALL_RESULT content", async () => {
    const memory = { snapshot: {} as Record<string, unknown> };
    const parts: TextStreamPart<ToolSet>[] = [
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "update_preferences",
        input: { genres: ["Comedy"] },
      } as TextStreamPart<ToolSet>,
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "update_preferences",
        input: { genres: ["Comedy"] },
        output: {
          data: { genres: ["Comedy"] },
          jsonPatchOps: [{ op: "add", path: "/genres", value: ["Comedy"] }],
        },
      } as TextStreamPart<ToolSet>,
    ];

    const stream = streamAgUiEvents(mockStream(parts), {
      ...baseOptions,
      memory,
    });
    const events = await collectEvents(stream);
    const resultEvent = events.find((e) => parseEventType(e) === "TOOL_CALL_RESULT")!;
    expect(resultEvent).not.toContain("jsonPatchOps");
    expect(resultEvent).toContain("\\\"data\\\"");
  });
});
