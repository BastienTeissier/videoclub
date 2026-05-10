import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModelMessage } from "ai";

vi.mock("ai", () => ({
  streamText: vi.fn(),
  stepCountIs: vi.fn(() => () => false),
}));

vi.mock("../../lib/ai-provider.js", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

vi.mock("../../features/tools/discovery.js", () => ({
  createDiscoveryTool: vi.fn(() => ({ type: "discovery_tool" })),
}));
vi.mock("../../features/tools/search-tmdb.js", () => ({
  createSearchTmdbTool: vi.fn(() => ({ type: "search_tmdb_tool" })),
}));
vi.mock("../../features/tools/watchlist-show.js", () => ({
  createWatchlistShowTool: vi.fn(() => ({ type: "watchlist_show_tool" })),
}));
vi.mock("../../features/tools/watchlist-add.js", () => ({
  createWatchlistAddTool: vi.fn(() => ({ type: "watchlist_add_tool" })),
}));
vi.mock("../../features/tools/watchlist-remove.js", () => ({
  createWatchlistRemoveTool: vi.fn(() => ({ type: "watchlist_remove_tool" })),
}));
vi.mock("../../features/tools/review-prefill.js", () => ({
  createReviewPrefillTool: vi.fn(() => ({ type: "review_prefill_tool" })),
}));
vi.mock("../../features/tools/review-show.js", () => ({
  createReviewShowTool: vi.fn(() => ({ type: "review_show_tool" })),
}));
vi.mock("../../features/tools/review-delete.js", () => ({
  createReviewDeleteTool: vi.fn(() => ({ type: "review_delete_tool" })),
}));
vi.mock("../../features/tools/update-preferences.js", () => ({
  createUpdatePreferencesTool: vi.fn(() => ({ type: "update_preferences_tool" })),
}));

vi.mock("./ag-ui-stream.js", () => ({
  streamAgUiEvents: vi.fn(async function* () {
    yield "data: {}\n\n";
  }),
  stripUiNoise: (output: unknown) => {
    if (!output || typeof output !== "object") return output;
    const obj = output as Record<string, unknown>;
    if (!("a2uiMessages" in obj) && !("warnings" in obj)) return output;
    const { a2uiMessages: _a, warnings: _w, ...rest } = obj;
    return rest;
  },
}));

const mockMessageCreate = vi.fn();
const mockFindBySessionId = vi.fn();
const mockSessionCreate = vi.fn();
const mockSessionFindById = vi.fn();
const mockSessionFindByIdForUser = vi.fn();
const mockFindLatestViewingPrefs = vi.fn();
const mockGetViewingPreferences = vi.fn();
const mockCreateRun = vi.fn();
const mockCreateToolCall = vi.fn();
const mockCompleteToolCall = vi.fn();
const mockCompleteRun = vi.fn();
const mockFailRun = vi.fn();
const mockFindToolCallByAiSdkCallId = vi.fn();
const mockFindCompletedToolCallsBySessionId = vi.fn();
const mockFindRunById = vi.fn();

vi.mock("@repo/db", () => ({
  chatMessagesRepository: vi.fn(() => ({
    create: mockMessageCreate,
    findBySessionId: mockFindBySessionId,
  })),
  agentSessionsRepository: vi.fn(() => ({
    create: mockSessionCreate,
    findById: mockSessionFindById,
    findByIdForUser: mockSessionFindByIdForUser,
    findLatestViewingPreferencesByUserId: mockFindLatestViewingPrefs,
    getViewingPreferences: mockGetViewingPreferences,
  })),
  agentRunsRepository: vi.fn(() => ({
    createRun: mockCreateRun,
    createToolCall: mockCreateToolCall,
    completeToolCall: mockCompleteToolCall,
    completeRun: mockCompleteRun,
    failRun: mockFailRun,
    findToolCallByAiSdkCallId: mockFindToolCallByAiSdkCallId,
    findCompletedToolCallsBySessionId: mockFindCompletedToolCallsBySessionId,
    findRunById: mockFindRunById,
  })),
}));

import { streamText } from "ai";
import { agentRun } from "./agent-run.js";

const mockStreamText = vi.mocked(streamText);

function mockStreamResult() {
  return {
    fullStream: (async function* () {})(),
    text: Promise.resolve(""),
    steps: Promise.resolve([]),
  };
}

function setupStreamTextMock(
  finishEvent: { text: string; steps: unknown[] } = { text: "Hello!", steps: [] },
) {
  mockStreamText.mockImplementation((opts: Record<string, unknown>) => {
    const onFinish = opts.onFinish as
      | ((event: { text: string; steps: unknown[] }) => Promise<void>)
      | undefined;
    if (onFinish) {
      Promise.resolve().then(() => onFinish(finishEvent));
    }
    return mockStreamResult() as unknown as ReturnType<typeof streamText>;
  });
}

const fakeDb = {} as Parameters<typeof agentRun>[0];

async function drain(events: AsyncGenerator<string>) {
  const out: string[] = [];
  for await (const e of events) out.push(e);
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSessionCreate.mockResolvedValue({ id: "session-1" });
  mockSessionFindById.mockResolvedValue({ id: "session-1" });
  mockSessionFindByIdForUser.mockResolvedValue({ id: "session-1" });
  mockFindLatestViewingPrefs.mockResolvedValue(null);
  mockGetViewingPreferences.mockResolvedValue({});
  mockFindRunById.mockResolvedValue({ id: "run-1", sessionId: "session-1" });
  mockMessageCreate.mockResolvedValue({ id: "msg-1" });
  mockFindBySessionId.mockResolvedValue([
    { id: "msg-1", role: "user", content: "test", createdAt: new Date() },
  ]);
  mockCreateRun.mockResolvedValue({ id: "run-1" });
  mockCreateToolCall.mockResolvedValue({ id: "tc-1" });
  mockFindCompletedToolCallsBySessionId.mockResolvedValue([]);
  setupStreamTextMock();
});

describe("agentRun.start", () => {
  it("registers all tools on streamText", async () => {
    await drain(
      agentRun(fakeDb).start({
        userId: "user-1",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "test" }],
      }),
    );

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          discovery: expect.anything(),
          search_tmdb: expect.anything(),
          watchlist_show: expect.anything(),
          watchlist_add: expect.anything(),
          watchlist_remove: expect.anything(),
          review_prefill: expect.anything(),
          review_show: expect.anything(),
          review_delete: expect.anything(),
          update_preferences: expect.anything(),
        }),
      }),
    );
  });

  it("passes messages array to streamText (no `prompt`)", async () => {
    const messages: ModelMessage[] = [{ role: "user", content: "find movies" }];
    await drain(
      agentRun(fakeDb).start({ userId: "user-1", runId: "ag-run-1", messages }),
    );
    const call = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
    expect(call).toHaveProperty("messages");
    expect(call).not.toHaveProperty("prompt");
  });

  it("system prompt mentions discovery and search_tmdb", async () => {
    await drain(
      agentRun(fakeDb).start({
        userId: "user-1",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "test" }],
      }),
    );
    const call = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.system).toContain("discovery");
    expect(call.system).toContain("search_tmdb");
  });

  it("persists tool calls with aiSdkCallId via onFinish", async () => {
    setupStreamTextMock({
      text: "ok",
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "call_abc",
              toolName: "discovery",
              input: { view: "grid" },
            },
          ],
          toolResults: [
            {
              toolCallId: "call_abc",
              output: { data: { movies: [] }, a2uiMessages: [] },
            },
          ],
        },
      ],
    });

    await drain(
      agentRun(fakeDb).start({
        userId: "user-1",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "test" }],
      }),
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(mockCreateToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        toolName: "discovery",
        aiSdkCallId: "call_abc",
      }),
    );
    expect(mockCompleteToolCall).toHaveBeenCalledWith("tc-1", expect.anything());
    expect(mockCompleteRun).toHaveBeenCalledWith("run-1");
  });

  it("does NOT complete run when a tool returned needs-clarification", async () => {
    setupStreamTextMock({
      text: "",
      steps: [
        {
          toolCalls: [
            { toolCallId: "call_x", toolName: "review_delete", input: { title: "Dune" } },
          ],
          toolResults: [
            {
              toolCallId: "call_x",
              output: {
                kind: "needs-clarification",
                candidates: [{ id: "a" }, { id: "b" }],
              },
            },
          ],
        },
      ],
    });

    await drain(
      agentRun(fakeDb).start({
        userId: "user-1",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "delete review of dune" }],
      }),
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(mockCompleteRun).not.toHaveBeenCalled();
  });

  it("does NOT complete run when a tool call has no result (pending approval)", async () => {
    setupStreamTextMock({
      text: "",
      steps: [
        {
          toolCalls: [
            { toolCallId: "call_y", toolName: "search_tmdb", input: { query: "x" } },
          ],
          toolResults: [],
        },
      ],
    });

    await drain(
      agentRun(fakeDb).start({
        userId: "user-1",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "search tmdb" }],
      }),
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(mockCompleteRun).not.toHaveBeenCalled();
  });

  it("persists assistant message via onFinish when text is non-empty", async () => {
    setupStreamTextMock({ text: "Hello!", steps: [] });

    await drain(
      agentRun(fakeDb).start({
        userId: "user-1",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "hi" }],
      }),
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ role: "assistant", content: "Hello!" }),
    );
  });

  it("replays prior completed tool calls as assistant tool-call + tool tool-result pairs after the originating user message", async () => {
    mockSessionFindByIdForUser.mockResolvedValue({ id: "session-existing" });
    mockFindBySessionId.mockResolvedValue([
      { id: "prev-1", role: "user", content: "feel-good comedy", createdAt: new Date("2024-01-01") },
      { id: "prev-2", role: "assistant", content: "", createdAt: new Date("2024-01-02") },
      { id: "prev-3", role: "user", content: "compare the top 3", createdAt: new Date("2024-01-03") },
    ]);
    mockFindCompletedToolCallsBySessionId.mockResolvedValue([
      {
        aiSdkCallId: "call_grid",
        toolName: "discovery",
        input: { view: "grid" },
        output: {
          data: { movies: [{ id: "m1" }, { id: "m2" }, { id: "m3" }], view: "grid" },
          a2uiMessages: [{ createSurface: { surfaceId: "discovery", catalogId: "videoclub" } }],
          warnings: [],
        },
        runMessageId: "prev-1",
      },
    ]);

    await drain(
      agentRun(fakeDb).start({
        userId: "user-1",
        threadId: "session-existing",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "compare the top 3" }],
      }),
    );

    const call = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
    const msgs = call.messages as ModelMessage[];

    // Order: user(prev-1) → assistant tool-call → tool tool-result → assistant(prev-2 text "") → user(input)
    expect(msgs[0]).toEqual({ role: "user", content: "feel-good comedy" });
    const toolCallMsg = msgs[1] as { role: string; content: Array<Record<string, unknown>> };
    expect(toolCallMsg.role).toBe("assistant");
    expect(toolCallMsg.content[0]).toMatchObject({
      type: "tool-call",
      toolCallId: "call_grid",
      toolName: "discovery",
      input: { view: "grid" },
    });
    const toolResultMsg = msgs[2] as { role: string; content: Array<Record<string, unknown>> };
    expect(toolResultMsg.role).toBe("tool");
    const resultContent = toolResultMsg.content[0] as { output: { value: { data: unknown; a2uiMessages?: unknown; warnings?: unknown } } };
    expect(resultContent.output.value).toEqual({
      data: { movies: [{ id: "m1" }, { id: "m2" }, { id: "m3" }], view: "grid" },
    });
    // a2uiMessages + warnings stripped from the prompt
    expect((resultContent.output.value as Record<string, unknown>).a2uiMessages).toBeUndefined();
    expect((resultContent.output.value as Record<string, unknown>).warnings).toBeUndefined();
    expect(msgs[3]).toEqual({ role: "assistant", content: "" });
  });

  it("loads previous session messages and prepends them to the model history", async () => {
    mockSessionFindByIdForUser.mockResolvedValue({ id: "session-existing" });
    mockFindBySessionId.mockResolvedValue([
      { id: "prev-1", role: "user", content: "old question", createdAt: new Date("2024-01-01") },
      { id: "prev-2", role: "assistant", content: "old answer", createdAt: new Date("2024-01-02") },
      { id: "prev-3", role: "user", content: "new question", createdAt: new Date("2024-01-03") },
    ]);

    await drain(
      agentRun(fakeDb).start({
        userId: "user-1",
        threadId: "session-existing",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "new question" }],
      }),
    );

    const call = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
    const msgs = call.messages as ModelMessage[];
    expect(msgs.length).toBeGreaterThanOrEqual(3);
    expect(msgs[0]).toEqual({ role: "user", content: "old question" });
    expect(msgs[1]).toEqual({ role: "assistant", content: "old answer" });
  });
});

describe("agentRun.resume", () => {
  it("looks up the pending tool call by aiSdkCallId, merges response, re-invokes the tool, and re-enters streamText", async () => {
    const executeSpy = vi.fn(async () => ({
      kind: "success",
      affected: ["reviews"],
      message: "deleted",
    }));

    // Override the mocked review_delete tool to expose execute
    const reviewDeleteModule = await import(
      "../../features/tools/review-delete.js"
    );
    vi.mocked(reviewDeleteModule.createReviewDeleteTool).mockReturnValueOnce({
      type: "review_delete_tool",
      execute: executeSpy,
    } as never);

    mockFindToolCallByAiSdkCallId.mockResolvedValue({
      id: "tc-row-1",
      aiSdkCallId: "call_abc",
      toolName: "review_delete",
      input: { title: "Dune" },
      output: { kind: "needs-clarification", candidates: [] },
      runId: "run-orig",
    });
    mockFindRunById.mockResolvedValue({ id: "run-orig", sessionId: "session-1" });
    mockCreateToolCall.mockResolvedValue({ id: "tc-row-2" });

    await drain(
      agentRun(fakeDb).resume({
        userId: "user-1",
        threadId: "session-1",
        runId: "ag-run-2",
        interruptId: "call_abc",
        response: { pickedMovieId: "movie-42" },
      }),
    );

    expect(mockFindToolCallByAiSdkCallId).toHaveBeenCalledWith("call_abc");
    expect(executeSpy).toHaveBeenCalledWith(
      { title: "Dune", movieId: "movie-42" },
      expect.objectContaining({ toolCallId: "resume-call_abc" }),
    );
    // Resume row attached to the SAME run as the original tool call.
    expect(mockCreateToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-orig",
        toolName: "review_delete",
        aiSdkCallId: "resume-call_abc",
      }),
    );
    // streamText was called for the continuation (LLM gets to keep talking).
    expect(mockStreamText).toHaveBeenCalledTimes(1);
  });

  it("throws when interruptId resolves to no row", async () => {
    mockFindToolCallByAiSdkCallId.mockResolvedValue(null);

    await expect(
      drain(
        agentRun(fakeDb).resume({
          userId: "user-1",
          threadId: "session-1",
          runId: "ag-run-2",
          interruptId: "missing",
          response: {},
        }),
      ),
    ).rejects.toThrow(/No tool call found/);
  });

  it("refuses to resume when the threadId does not belong to the user (ownership mismatch)", async () => {
    mockFindToolCallByAiSdkCallId.mockResolvedValue({
      id: "tc-row-1",
      aiSdkCallId: "call_abc",
      toolName: "review_delete",
      input: { title: "Dune" },
      output: { kind: "needs-clarification", candidates: [] },
      runId: "run-orig",
    });
    mockSessionFindByIdForUser.mockResolvedValue(null); // ownership mismatch

    await expect(
      drain(
        agentRun(fakeDb).resume({
          userId: "user-1",
          threadId: "someone-elses-session",
          runId: "ag-run-2",
          interruptId: "call_abc",
          response: { pickedMovieId: "movie-42" },
        }),
      ),
    ).rejects.toThrow(/Session not found/);
  });

  it("refuses to resume when the pending interrupt belongs to a different session", async () => {
    mockFindToolCallByAiSdkCallId.mockResolvedValue({
      id: "tc-row-1",
      aiSdkCallId: "call_abc",
      toolName: "review_delete",
      input: { title: "Dune" },
      output: { kind: "needs-clarification", candidates: [] },
      runId: "run-orig",
    });
    mockSessionFindByIdForUser.mockResolvedValue({ id: "session-A" });
    mockFindRunById.mockResolvedValue({
      id: "run-orig",
      sessionId: "session-B", // run belongs to a different session
    });

    await expect(
      drain(
        agentRun(fakeDb).resume({
          userId: "user-1",
          threadId: "session-A",
          runId: "ag-run-2",
          interruptId: "call_abc",
          response: {},
        }),
      ),
    ).rejects.toThrow(/Interrupt does not belong/);
  });
});

describe("agentRun.start ownership", () => {
  it("creates a fresh session when threadId does not belong to the user", async () => {
    mockSessionFindByIdForUser.mockResolvedValue(null); // mismatch
    mockSessionCreate.mockResolvedValue({ id: "session-new" });

    await drain(
      agentRun(fakeDb).start({
        userId: "user-1",
        threadId: "someone-elses-session",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "hi" }],
      }),
    );

    // Did not read the foreign session, started a new one for this user.
    expect(mockSessionFindByIdForUser).toHaveBeenCalledWith(
      "someone-elses-session",
      "user-1",
    );
    expect(mockSessionCreate).toHaveBeenCalledWith("user-1", undefined);
    expect(mockCreateRun).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-new" }),
    );
  });
});

describe("agentRun memory seeding + system-prompt", () => {
  it("seeds a new session from the latest user prefs when no threadId", async () => {
    mockFindLatestViewingPrefs.mockResolvedValue({ genres: ["Comedy"] });
    mockSessionCreate.mockResolvedValue({
      id: "session-seeded",
      viewingPreferences: { genres: ["Comedy"] },
    });
    mockGetViewingPreferences.mockResolvedValue({ genres: ["Comedy"] });

    await drain(
      agentRun(fakeDb).start({
        userId: "user-1",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "find me something" }],
      }),
    );

    expect(mockFindLatestViewingPrefs).toHaveBeenCalledWith("user-1");
    expect(mockSessionCreate).toHaveBeenCalledWith("user-1", {
      genres: ["Comedy"],
    });
  });

  it("creates an empty session when the user has no prior prefs", async () => {
    mockFindLatestViewingPrefs.mockResolvedValue(null);

    await drain(
      agentRun(fakeDb).start({
        userId: "user-fresh",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "hi" }],
      }),
    );

    expect(mockFindLatestViewingPrefs).toHaveBeenCalledWith("user-fresh");
    expect(mockSessionCreate).toHaveBeenCalledWith("user-fresh", undefined);
  });

  it("reuses the session for an owned threadId without seeding", async () => {
    mockSessionFindByIdForUser.mockResolvedValue({ id: "session-existing" });

    await drain(
      agentRun(fakeDb).start({
        userId: "user-1",
        threadId: "session-existing",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "hi" }],
      }),
    );

    expect(mockSessionFindByIdForUser).toHaveBeenCalledWith(
      "session-existing",
      "user-1",
    );
    expect(mockFindLatestViewingPrefs).not.toHaveBeenCalled();
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("appends the formatted memory section to the system prompt when memory is non-empty", async () => {
    mockGetViewingPreferences.mockResolvedValue({ genres: ["Comedy"] });

    await drain(
      agentRun(fakeDb).start({
        userId: "user-1",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "hi" }],
      }),
    );

    const call = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.system).toContain("Preferred genres: Comedy");
  });

  it("leaves the system prompt unchanged when memory is empty", async () => {
    mockGetViewingPreferences.mockResolvedValue({});

    await drain(
      agentRun(fakeDb).start({
        userId: "user-1",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "hi" }],
      }),
    );

    const call = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.system).not.toContain("User viewing preferences");
  });

  it("passes a memory ref carrying the seeded snapshot to streamAgUiEvents", async () => {
    mockGetViewingPreferences.mockResolvedValue({ genres: ["Comedy"] });
    const streamModule = await import("./ag-ui-stream.js");
    const streamSpy = vi.mocked(streamModule.streamAgUiEvents);

    await drain(
      agentRun(fakeDb).start({
        userId: "user-1",
        runId: "ag-run-1",
        messages: [{ role: "user", content: "hi" }],
      }),
    );

    expect(streamSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        memory: { snapshot: { genres: ["Comedy"] } },
      }),
    );
  });
});
